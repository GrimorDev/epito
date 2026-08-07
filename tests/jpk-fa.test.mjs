import assert from "node:assert/strict";
import test from "node:test";
import { parseJpkFaSalesInvoices } from "../lib/server/jpk-fa.ts";

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<JPK>
  <Naglowek>
    <DataOd>2026-07-01</DataOd>
    <DataDo>2026-07-31</DataDo>
  </Naglowek>
  <Podmiot1>
    <NIP>6117973520</NIP>
    <Nazwa>robotic sp. z o.o.</Nazwa>
  </Podmiot1>
  <Faktury>
    <Faktura>
      <P_1>2026-07-05</P_1>
      <P_2A>FV/07/2026/1</P_2A>
      <P_15>1230.50</P_15>
      <KodWaluty>PLN</KodWaluty>
      <Podmiot2>
        <NIP>1234567890</NIP>
        <Nazwa>Kontrahent A</Nazwa>
      </Podmiot2>
    </Faktura>
    <Faktura>
      <P_1>2026-07-18</P_1>
      <P_2A>FV/07/2026/2</P_2A>
      <P_15>987.65</P_15>
      <KodWaluty>PLN</KodWaluty>
      <Podmiot2>
        <NIP>9876543210</NIP>
        <Nazwa>Kontrahent B</Nazwa>
      </Podmiot2>
    </Faktura>
  </Faktury>
</JPK>`;

test("parseJpkFaSalesInvoices extracts the filer NIP and every invoice", () => {
  const result = parseJpkFaSalesInvoices(sampleXml);
  assert.equal(result.sellerNip, "6117973520");
  assert.equal(result.invoices.length, 2);

  const [first, second] = result.invoices;
  assert.equal(first.invoiceNumber, "FV/07/2026/1");
  assert.equal(first.issuedAt, "2026-07-05");
  assert.equal(first.grossAmount, 1230.5);
  assert.equal(first.currency, "PLN");
  assert.equal(first.buyerNip, "1234567890");
  assert.equal(first.buyerName, "Kontrahent A");
  assert.ok(first.rawXml.includes("FV/07/2026/1"));

  assert.equal(second.invoiceNumber, "FV/07/2026/2");
  assert.equal(second.buyerNip, "9876543210");
});

test("parseJpkFaSalesInvoices throws a clear error when no invoices are found", () => {
  assert.throws(() => parseJpkFaSalesInvoices("<JPK><Naglowek/></JPK>"), /Nie znaleziono/);
});
