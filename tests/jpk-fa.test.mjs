import assert from "node:assert/strict";
import test from "node:test";
import { parseJpkFaSalesInvoices } from "../lib/server/jpk-fa.ts";
import { parseInvoiceDetails } from "../lib/server/ksef/client.ts";

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
  <tns:fakturawiersz>
    <tns:p_2b>16/FV/2024</tns:p_2b>
    <tns:p_7>Galanteria skórzana</tns:p_7>
    <tns:p_8a>szt</tns:p_8a>
    <tns:p_8b>1.0000</tns:p_8b>
    <tns:p_9a>83.33</tns:p_9a>
    <tns:p_11>83.33</tns:p_11>
    <tns:p_12>8</tns:p_12>
  </tns:fakturawiersz>
  <tns:fakturawiersz>
    <tns:p_2b>18/FV/2024</tns:p_2b>
    <tns:p_7>Krzesło ogrodowe</tns:p_7>
    <tns:p_8a>szt</tns:p_8a>
    <tns:p_8b>1.0000</tns:p_8b>
    <tns:p_9a>83.33</tns:p_9a>
    <tns:p_11>83.33</tns:p_11>
    <tns:p_12>8</tns:p_12>
  </tns:fakturawiersz>
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

test("line items (sibling FakturaWiersz records) are joined onto their invoice by P_2B/P_2A and survive re-parsing by the preview renderer", () => {
  const result = parseJpkFaSalesInvoices(realJpkFaSample);
  const [first, second] = result.invoices;

  assert.ok(first.rawXml.includes("Galanteria skórzana"));
  assert.ok(!first.rawXml.includes("Krzesło ogrodowe"), "invoice 1's line items must not include invoice 2's line");

  // The stored rawXml is what the "Podgląd" preview later re-parses via
  // parseInvoiceDetails (lib/server/ksef/client.ts) — confirm that pass also
  // recovers seller/buyer/line-item data from JPK_FA's flat field names,
  // not just KSeF's nested Podmiot1/Podmiot2/FaWiersz structure.
  const details = parseInvoiceDetails(first.rawXml);
  assert.equal(details.seller.nip, "5271048000");
  assert.equal(details.seller.name, null); // no P_3C in this trimmed sample
  assert.equal(details.buyer.nip, "5671920807");
  assert.equal(details.buyer.name, "Testowy klient 1");
  assert.equal(details.lines.length, 1);
  assert.equal(details.lines[0].name, "Galanteria skórzana");
  assert.equal(details.lines[0].netAmount, 83.33);

  const detailsSecond = parseInvoiceDetails(second.rawXml);
  assert.equal(detailsSecond.lines.length, 1);
  assert.equal(detailsSecond.lines[0].name, "Krzesło ogrodowe");
});
