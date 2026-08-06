const amountLabels = [
  "do zapłaty",
  "razem brutto",
  "kwota brutto",
  "suma brutto",
  "wartość brutto",
  "należność ogółem",
  "total gross",
  "amount due",
  "total",
];

function normalizeSpace(value) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function parseMoney(value) {
  const compact = value.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!compact) return null;
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  let normalized = compact;
  if (lastComma > lastDot) normalized = compact.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma) normalized = compact.replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 && amount < 1_000_000_000 ? amount : null;
}

function currencyNear(value) {
  const match = value.match(/\b(PLN|EUR|USD|GBP|CHF)\b|\b(zł|zl)\b/i);
  if (!match) return "PLN";
  const currency = (match[1] || match[2]).toUpperCase();
  return currency === "ZŁ" || currency === "ZL" ? "PLN" : currency;
}

function findLabeledAmount(text) {
  const lines = text.split(/\r?\n/).map(normalizeSpace).filter(Boolean);
  for (const label of amountLabels) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.toLocaleLowerCase("pl").includes(label)) continue;
      const scope = `${line} ${lines[index + 1] || ""}`;
      const candidates = [...scope.matchAll(/(?:^|\s)(\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{2})|\d+[,.]\d{2})(?:\s*)(PLN|EUR|USD|GBP|CHF|zł|zl)?\b/gi)];
      if (!candidates.length) continue;
      const selected = candidates.at(-1);
      const amount = parseMoney(selected?.[1] || "");
      if (amount !== null) return { amount, currency: currencyNear(scope), label, confidence: 0.94 };
    }
  }
  return null;
}

function findInvoiceNumber(text) {
  const match = text.match(/(?:faktura(?:\s+vat)?|invoice)\s*(?:nr|no\.?|number)?\s*[:#]?\s*([^\n\r]{2,60})/i);
  if (!match) return null;
  return normalizeSpace(match[1]).replace(/\s{2,}.*$/, "").slice(0, 80) || null;
}

function isoDate(day, month, year) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function findIssueDate(text) {
  const labeled = text.match(/(?:data\s+wystawienia|wystawiono|issue\s+date)\s*[:]?\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/i);
  return labeled ? isoDate(labeled[1], labeled[2], labeled[3]) : null;
}

function findNips(text) {
  const matches = [...text.matchAll(/(?:NIP\s*[:]?\s*)?(\d{3}[- ]?\d{3}[- ]?\d{2}[- ]?\d{2}|\d{10})\b/gi)];
  return [...new Set(matches.map((match) => match[1].replace(/\D/g, "")).filter((nip) => nip.length === 10))].slice(0, 4);
}

export function extractInvoiceData(rawText, options = {}) {
  const text = String(rawText || "").replace(/\u0000/g, "");
  const labeledAmount = findLabeledAmount(text);
  const invoiceNumber = findInvoiceNumber(text);
  const issuedAt = findIssueDate(text);
  const nips = findNips(text);
  const method = options.method === "ocr" ? "ocr" : "pdf_text";
  const ocrConfidence = Number.isFinite(options.ocrConfidence) ? Math.max(0, Math.min(1, options.ocrConfidence)) : null;
  const baseConfidence = labeledAmount?.confidence || 0;
  const confidence = method === "ocr" && ocrConfidence !== null
    ? Number((baseConfidence * (0.65 + ocrConfidence * 0.35)).toFixed(2))
    : baseConfidence;

  return {
    amount: labeledAmount?.amount ?? null,
    currency: labeledAmount?.currency || "PLN",
    amountLabel: labeledAmount?.label || null,
    invoiceNumber,
    issuedAt,
    nips,
    confidence,
    method,
    textLength: text.trim().length,
    textExcerpt: normalizeSpace(text).slice(0, 1200),
  };
}

export function hasUsefulPdfText(text) {
  const normalized = String(text || "").replace(/\s/g, "");
  return normalized.length >= 80 && /(?:faktura|invoice|nip|brutto|zapłaty)/i.test(text);
}
