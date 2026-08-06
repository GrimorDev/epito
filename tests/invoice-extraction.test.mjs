import assert from "node:assert/strict";
import test from "node:test";
import { extractInvoiceData, hasUsefulPdfText } from "../scripts/lib/invoice-extraction.mjs";

test("extracts a Polish gross amount, invoice number and issue date", () => {
  const result = extractInvoiceData(`
    FAKTURA VAT nr FV/08/2026/19
    Data wystawienia: 06.08.2026
    Sprzedawca NIP 5252931842
    Razem brutto 1 248,60 PLN
  `);
  assert.equal(result.amount, 1248.6);
  assert.equal(result.currency, "PLN");
  assert.equal(result.invoiceNumber, "FV/08/2026/19");
  assert.equal(result.issuedAt, "2026-08-06");
  assert.deepEqual(result.nips, ["5252931842"]);
  assert.equal(result.method, "pdf_text");
});

test("accepts a labeled euro amount and adjusts OCR confidence", () => {
  const result = extractInvoiceData("INVOICE no INV-91\nAmount due 2.999,95 EUR", { method: "ocr", ocrConfidence: 0.8 });
  assert.equal(result.amount, 2999.95);
  assert.equal(result.currency, "EUR");
  assert.equal(result.method, "ocr");
  assert.ok(result.confidence > 0.8 && result.confidence < 0.94);
});

test("does not invent an amount when no labeled total exists", () => {
  const result = extractInvoiceData("Umowa leasingu. Numer klienta 123456. Data 06.08.2026.");
  assert.equal(result.amount, null);
  assert.equal(result.confidence, 0);
});

test("recognizes whether embedded PDF text is useful", () => {
  assert.equal(hasUsefulPdfText("skan"), false);
  assert.equal(hasUsefulPdfText(`Faktura VAT\n${"pozycja dokumentu ".repeat(10)}\nRazem brutto 120,00 PLN`), true);
});
