import assert from "node:assert/strict";
import test from "node:test";
import { parseJpkFaSalesInvoices } from "../lib/server/jpk-fa.ts";

// Trimmed from a real JPK_FA(4) export (dummy "Testowa"/"Testowy" data).
// Real-world JPK_FA uses all-lowercase tags, unlike KSeF's PascalCase FA
// schema — this is the exact case that broke the first implementation.
const realJpkFaSample = `<?xml version="1.0" encoding="utf-8"?>
<tns:jpk xmlns:tns="http://jpk.mf.gov.pl/wzor/2022/02/17/02171/">
  <tns:naglowek>
    <tns:dataod>2025-01-01</tns:dataod>
    <tns:datado>2025-01-31</tns:datado>
  </tns:naglowek>
  <tns:podmiot1>
    <tns:identyfikatorpodmiotu>
      <tns:nip>5271048000</tns:nip>
      <tns:pelnanazwa>TESTOWA FIRMA GLOWNA S. A.</tns:pelnanazwa>
    </tns:identyfikatorpodmiotu>
  </tns:podmiot1>
  <tns:faktura>
    <tns:kodwaluty>PLN</tns:kodwaluty>
    <tns:p_1>2024-04-03</tns:p_1>
    <tns:p_2a>16/FV/2024</tns:p_2a>
    <tns:p_3a>Testowy klient 1</tns:p_3a>
    <tns:p_3b>Rozkoszna 1, 09-150 Roguszyn</tns:p_3b>
    <tns:p_4a>PL</tns:p_4a>
    <tns:p_4b>5271048000</tns:p_4b>
    <tns:p_5b>5671920807</tns:p_5b>
    <tns:p_6>2025-01-31</tns:p_6>
    <tns:p_15>90.00</tns:p_15>
    <tns:rodzajfaktury>VAT</tns:rodzajfaktury>
  </tns:faktura>
  <tns:faktura>
    <tns:kodwaluty>PLN</tns:kodwaluty>
    <tns:p_1>2024-04-13</tns:p_1>
    <tns:p_2a>18/FV/2024</tns:p_2a>
    <tns:p_3a>Testowy klient 2</tns:p_3a>
    <tns:p_4a>PL</tns:p_4a>
    <tns:p_4b>5271048000</tns:p_4b>
    <tns:p_6>2025-01-13</tns:p_6>
    <tns:p_15>90.00</tns:p_15>
    <tns:rodzajfaktury>VAT</tns:rodzajfaktury>
  </tns:faktura>
  <tns:fakturactrl>
    <tns:liczbafaktur>2</tns:liczbafaktur>
    <tns:wartoscfaktur>90.00</tns:wartoscfaktur>
  </tns:fakturactrl>
</tns:jpk>`;

test("parseJpkFaSalesInvoices handles real all-lowercase JPK_FA(4) tags", () => {
  const result = parseJpkFaSalesInvoices(realJpkFaSample);
  assert.equal(result.sellerNip, "5271048000");
  assert.equal(result.invoices.length, 2);

  const [first, second] = result.invoices;
  assert.equal(first.invoiceNumber, "16/FV/2024");
  assert.equal(first.issuedAt, "2024-04-03");
  assert.equal(first.grossAmount, 90);
  assert.equal(first.currency, "PLN");
  assert.equal(first.buyerNip, "5671920807");
  assert.equal(first.buyerName, "Testowy klient 1");
  assert.ok(first.rawXml.includes("16/FV/2024"));

  // Second invoice has no p_5b (buyer NIP unknown) — must resolve to null,
  // not silently fall back to the seller's own NIP or throw.
  assert.equal(second.invoiceNumber, "18/FV/2024");
  assert.equal(second.buyerNip, null);
  assert.equal(second.buyerName, "Testowy klient 2");
});

test("parseJpkFaSalesInvoices throws a clear error when no invoices are found", () => {
  assert.throws(() => parseJpkFaSalesInvoices("<tns:jpk><tns:naglowek/></tns:jpk>"), /Nie znaleziono/);
});
