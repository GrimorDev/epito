import { createHash } from "node:crypto";
import iconv from "iconv-lite";
import { XMLParser } from "fast-xml-parser";
import { parseMt940Statement } from "@/lib/server/mt940";

export type BankStatementFormat = "mt940" | "camt053" | "csv";

export type BankStatementTransaction = {
  valueDate: string;
  direction: "credit" | "debit";
  amount: number;
  currency: string;
  description: string;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  externalReference: string | null;
};

export type ParsedBankStatement = {
  format: BankStatementFormat;
  accountId: string | null;
  statementNumber: string | null;
  transactions: BankStatementTransaction[];
};

function scalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return scalar((value as Record<string, unknown>)["#text"]);
  return "";
}

function first<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string): string {
  return value
    .replace(/[Łł]/g, (letter) => letter === "Ł" ? "L" : "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseDate(value: string): string | null {
  const normalized = value.trim();
  let match = normalized.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = normalized.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function parseMoney(value: string): number | null {
  let normalized = value.trim().replace(/[\u00a0\s]/g, "").replace(/[A-Za-złŁ]/g, "");
  const parenthesized = normalized.startsWith("(") && normalized.endsWith(")");
  normalized = normalized.replace(/[()]/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parenthesized ? -Math.abs(parsed) : parsed;
}

function decodeText(input: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input).replace(/^\uFEFF/, "");
  } catch {
    return iconv.decode(input, "windows-1250").replace(/^\uFEFF/, "");
  }
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function parseCsv(input: Buffer): ParsedBankStatement {
  const text = decodeText(input);
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("Plik CSV nie zawiera transakcji.");
  const delimiter = (lines[0].match(/;/g)?.length || 0) >= (lines[0].match(/,/g)?.length || 0) ? ";" : ",";
  const headers = parseDelimitedLine(lines[0], delimiter).map(normalizeHeader);
  const dateIndex = findColumn(headers, ["data", "data operacji", "data ksiegowania", "booking date", "booked at"]);
  const amountIndex = findColumn(headers, ["kwota", "kwota operacji", "amount", "transaction amount"]);
  const creditIndex = findColumn(headers, ["uznanie", "wplyw", "credit", "credit amount"]);
  const debitIndex = findColumn(headers, ["obciazenie", "wydatek", "debit", "debit amount"]);
  const currencyIndex = findColumn(headers, ["waluta", "currency"]);
  const descriptionIndex = findColumn(headers, ["tytul", "tytul operacji", "opis", "description", "details"]);
  const nameIndex = findColumn(headers, ["kontrahent", "nazwa kontrahenta", "nadawca odbiorca", "counterparty", "counterparty name"]);
  const accountIndex = findColumn(headers, ["rachunek", "nr rachunku", "numer rachunku", "konto kontrahenta", "account", "counterparty account"]);
  const referenceIndex = findColumn(headers, ["referencja", "numer referencyjny", "reference", "transaction id"]);
  if (dateIndex < 0 || (amountIndex < 0 && creditIndex < 0 && debitIndex < 0) || descriptionIndex < 0) {
    throw new Error("CSV musi zawierać kolumny daty, kwoty oraz tytułu lub opisu transakcji.");
  }

  const transactions: BankStatementTransaction[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseDelimitedLine(line, delimiter);
    const valueDate = parseDate(cells[dateIndex] || "");
    let signedAmount = amountIndex >= 0 ? parseMoney(cells[amountIndex] || "") : null;
    if (signedAmount === null && creditIndex >= 0) {
      const credit = parseMoney(cells[creditIndex] || "");
      if (credit !== null && credit !== 0) signedAmount = Math.abs(credit);
    }
    if (signedAmount === null && debitIndex >= 0) {
      const debit = parseMoney(cells[debitIndex] || "");
      if (debit !== null && debit !== 0) signedAmount = -Math.abs(debit);
    }
    const description = normalizeWhitespace(cells[descriptionIndex] || "");
    if (!valueDate || signedAmount === null || signedAmount === 0 || !description) continue;
    transactions.push({
      valueDate,
      direction: signedAmount > 0 ? "credit" : "debit",
      amount: Math.abs(signedAmount),
      currency: (currencyIndex >= 0 ? cells[currencyIndex] : "PLN")?.trim().toUpperCase() || "PLN",
      description,
      counterpartyName: nameIndex >= 0 ? normalizeWhitespace(cells[nameIndex] || "") || null : null,
      counterpartyAccount: accountIndex >= 0 ? (cells[accountIndex] || "").replace(/\s/g, "") || null : null,
      externalReference: referenceIndex >= 0 ? normalizeWhitespace(cells[referenceIndex] || "") || null : null,
    });
  }
  if (!transactions.length) throw new Error("Nie znaleziono prawidłowych transakcji w pliku CSV.");
  return { format: "csv", accountId: null, statementNumber: null, transactions };
}

type XmlNode = Record<string, unknown>;

function nested(node: unknown, ...path: string[]): unknown {
  let current = node;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as XmlNode)[key];
  }
  return current;
}

function joinXmlValues(values: unknown[]): string {
  return normalizeWhitespace(values.flatMap((value) => asArray(value).map(scalar)).filter(Boolean).join(" "));
}

function parseCamt053(input: Buffer): ParsedBankStatement {
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true });
  const document = parser.parse(decodeText(input)) as XmlNode;
  const statements = asArray(nested(document, "Document", "BkToCstmrStmt", "Stmt") as XmlNode | XmlNode[] | undefined);
  if (!statements.length) throw new Error("Plik XML nie jest wyciągiem CAMT.053.");
  const transactions: BankStatementTransaction[] = [];

  for (const statement of statements) {
    for (const entry of asArray((statement as XmlNode).Ntry as XmlNode | XmlNode[] | undefined)) {
      const amountNode = (entry as XmlNode).Amt;
      const amount = Math.abs(Number(scalar(amountNode).replace(",", ".")));
      const direction = scalar((entry as XmlNode).CdtDbtInd) === "DBIT" ? "debit" : "credit";
      const date = parseDate(scalar(nested(entry, "BookgDt", "Dt") || nested(entry, "BookgDt", "DtTm")));
      const detailsRoot = first(nested(entry, "NtryDtls", "TxDtls") as XmlNode | XmlNode[] | undefined) as XmlNode | undefined;
      const remittance = detailsRoot ? joinXmlValues([
        nested(detailsRoot, "RmtInf", "Ustrd"),
        nested(detailsRoot, "RmtInf", "Strd", "CdtrRefInf", "Ref"),
        (entry as XmlNode).AddtlNtryInf,
      ]) : normalizeWhitespace(scalar((entry as XmlNode).AddtlNtryInf));
      const reference = detailsRoot ? joinXmlValues([
        nested(detailsRoot, "Refs", "EndToEndId"),
        nested(detailsRoot, "Refs", "TxId"),
        nested(detailsRoot, "Refs", "AcctSvcrRef"),
      ]) || null : null;
      const party = direction === "credit" ? nested(detailsRoot, "RltdPties", "Dbtr", "Pty", "Nm") : nested(detailsRoot, "RltdPties", "Cdtr", "Pty", "Nm");
      const account = direction === "credit" ? nested(detailsRoot, "RltdPties", "DbtrAcct", "Id", "IBAN") : nested(detailsRoot, "RltdPties", "CdtrAcct", "Id", "IBAN");
      if (!date || !Number.isFinite(amount) || amount <= 0 || !remittance) continue;
      transactions.push({
        valueDate: date,
        direction,
        amount,
        currency: scalar((amountNode as XmlNode | undefined)?.["@_Ccy"]).toUpperCase() || "PLN",
        description: remittance,
        counterpartyName: normalizeWhitespace(scalar(party)) || null,
        counterpartyAccount: scalar(account).replace(/\s/g, "") || null,
        externalReference: reference,
      });
    }
  }
  if (!transactions.length) throw new Error("Nie znaleziono transakcji w wyciągu CAMT.053.");
  const firstStatement = statements[0] as XmlNode;
  return {
    format: "camt053",
    accountId: scalar(nested(firstStatement, "Acct", "Id", "IBAN")) || null,
    statementNumber: scalar(firstStatement.Id) || null,
    transactions,
  };
}

export function parseBankStatement(input: Buffer, fileName: string): ParsedBankStatement {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "csv") return parseCsv(input);
  if (extension === "xml") return parseCamt053(input);
  const statement = parseMt940Statement(input);
  return {
    format: "mt940",
    accountId: statement.accountId,
    statementNumber: statement.statementNumber,
    transactions: statement.transactions.map((transaction) => ({
      valueDate: transaction.valueDate,
      direction: transaction.direction,
      amount: transaction.amount,
      currency: transaction.currency,
      description: transaction.description,
      counterpartyName: null,
      counterpartyAccount: transaction.counterpartyAccount,
      externalReference: transaction.statementReference,
    })),
  };
}

export function transactionFingerprint(transaction: BankStatementTransaction): string {
  return createHash("sha256")
    .update([
      transaction.valueDate,
      transaction.direction,
      transaction.amount.toFixed(2),
      transaction.currency.toUpperCase(),
      normalizeWhitespace(transaction.description).toUpperCase(),
      transaction.counterpartyAccount?.replace(/\s/g, "") || "",
      transaction.externalReference || "",
    ].join("|"))
    .digest("hex");
}
