import iconv from "iconv-lite";

export type Mt940Balance = { date: string; amount: number; currency: string };

export type Mt940Transaction = {
  valueDate: string;
  entryDate: string | null;
  direction: "credit" | "debit";
  amount: number;
  currency: string;
  reference: string;
  statementReference: string;
  description: string;
  counterpartyAccount: string | null;
};

export type Mt940Statement = {
  accountId: string | null;
  statementNumber: string | null;
  openingBalance: Mt940Balance | null;
  closingBalance: Mt940Balance | null;
  transactions: Mt940Transaction[];
};

const TAG_LINE = /^:(\d{2}[A-Z]?):(.*)$/;

// Polish bank exports are commonly windows-1250 (diacritics in :86: free
// text), not UTF-8 — a strict UTF-8 decode throws on those byte sequences,
// which is exactly the signal used here to fall back.
function decodeStatementText(input: string | Buffer): string {
  if (typeof input === "string") return input;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    return iconv.decode(input, "windows-1250");
  }
}

function splitFields(text: string): Array<{ tag: string; value: string }> {
  const fields: Array<{ tag: string; value: string }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "");
    const match = line.match(TAG_LINE);
    if (match) {
      fields.push({ tag: match[1], value: match[2] });
    } else if (fields.length && line.trim()) {
      // Continuation of a multi-line field (most often :86: free text).
      fields[fields.length - 1].value += `\n${line}`;
    }
  }
  return fields;
}

function parseAmount(raw: string): number {
  return Number(raw.replace(/[^\d,]/g, "").replace(",", "."));
}

function toIsoDate(yymmdd: string): string {
  const year = Number(yymmdd.slice(0, 2));
  const fullYear = year >= 70 ? 1900 + year : 2000 + year;
  return `${fullYear}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

function parseBalanceField(value: string): Mt940Balance | null {
  const match = value.match(/^([DC])(\d{6})([A-Z]{3})([\d,]+)$/);
  if (!match) return null;
  const [, , yymmdd, currency, amountRaw] = match;
  return { date: toIsoDate(yymmdd), amount: parseAmount(amountRaw), currency };
}

type PendingLine = Omit<Mt940Transaction, "description" | "counterpartyAccount" | "currency">;

// SWIFT MT940 :61: layout: 6!n[4!n]2a[1!a]15d1!a3!c16x[//16x]. The
// transaction-type code (1!a3!c) and the account-owner reference (16x) both
// sit in free-form alphanumeric tails with no reliable delimiter between
// them — this regex takes the fixed-width fields literally and treats
// everything after the type code as the reference. Good enough to recover
// value date/amount/direction reliably; the reference is only ever used as
// a fallback dedup key, since real matching happens against :86: free text.
const STATEMENT_LINE = /^(\d{6})(\d{4})?(R?[CD])([A-Z])?([\d,]+)([A-Z][A-Z0-9]{3})?([^\n]*?)(?:\/\/([^\n]*))?$/;

function parseStatementLine(value: string, index: number): PendingLine | null {
  const match = value.match(STATEMENT_LINE);
  if (!match) return null;
  const [, valueDateRaw, entryDateRaw, mark, , amountRaw, , referenceRaw] = match;
  const direction: "credit" | "debit" = mark.endsWith("C") ? "credit" : "debit";
  const valueDate = toIsoDate(valueDateRaw);
  const reference = (referenceRaw || "").trim() || "NONREF";
  const statementReference = reference !== "NONREF" ? reference : `L${index}-${valueDateRaw}-${amountRaw}`;
  return {
    valueDate,
    entryDate: entryDateRaw ? `${valueDate.slice(0, 4)}-${entryDateRaw.slice(0, 2)}-${entryDateRaw.slice(2, 4)}` : null,
    direction,
    amount: parseAmount(amountRaw),
    reference,
    statementReference,
  };
}

function normalizeDescription(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/^[~>]\d{2}/, " ").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// Structured subfield layouts for the counterparty's own account (:86:)
// differ per bank and aren't reliable enough to parse generically — an IBAN
// or raw 26-digit NRB appearing anywhere in the free text is, so that's all
// this recovers. The description text itself carries our payment reference
// and is what actual reconciliation matches against.
function extractCounterpartyAccount(description: string): string | null {
  const match = description.match(/\b(PL\d{26}|\d{26})\b/);
  return match ? match[0] : null;
}

export function parseMt940Statement(input: string | Buffer): Mt940Statement {
  const text = decodeStatementText(input);
  const fields = splitFields(text);

  let accountId: string | null = null;
  let statementNumber: string | null = null;
  let openingBalance: Mt940Balance | null = null;
  let closingBalance: Mt940Balance | null = null;
  const transactions: Mt940Transaction[] = [];

  let pending: PendingLine | null = null;
  let lineIndex = 0;

  const flushPending = (description: string) => {
    if (!pending) return;
    transactions.push({
      ...pending,
      description,
      counterpartyAccount: extractCounterpartyAccount(description),
      currency: "PLN",
    });
    pending = null;
  };

  for (const field of fields) {
    if (field.tag === "25") {
      accountId = field.value.trim() || null;
    } else if (field.tag === "28C") {
      statementNumber = field.value.trim() || null;
    } else if (field.tag === "60F" || field.tag === "60M") {
      openingBalance = parseBalanceField(field.value.trim());
    } else if (field.tag === "62F" || field.tag === "62M") {
      closingBalance = parseBalanceField(field.value.trim());
    } else if (field.tag === "61") {
      flushPending("");
      pending = parseStatementLine(field.value.trim(), lineIndex);
      lineIndex += 1;
    } else if (field.tag === "86") {
      flushPending(normalizeDescription(field.value));
    }
  }
  flushPending("");

  const currency = openingBalance?.currency ?? closingBalance?.currency ?? "PLN";
  return {
    accountId,
    statementNumber,
    openingBalance,
    closingBalance,
    transactions: transactions.map((transaction) => ({ ...transaction, currency })),
  };
}
