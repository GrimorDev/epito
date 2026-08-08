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
  assert.equal(details.seller.name, "TESTOWA FIRMA GLOWNA S. A."); // recovered via the embedded Podmiot1 block
  assert.equal(details.buyer.nip, "5671920807");
  assert.equal(details.buyer.name, "Testowy klient 1");
  assert.equal(details.lines.length, 1);
  assert.equal(details.lines[0].name, "Galanteria skórzana");
  assert.equal(details.lines[0].netAmount, 83.33);

  const detailsSecond = parseInvoiceDetails(second.rawXml);
  assert.equal(detailsSecond.lines.length, 1);
  assert.equal(detailsSecond.lines[0].name, "Krzesło ogrodowe");
});

// A user-supplied sample file (PascalCase, flat <Podmiot1><NIP>/<PelnaNazwa>,
// no P_5B at all — buyer NIP lives at P_3D instead) that surfaced two real
// bugs: (1) Podmiot1 wasn't carried into each invoice's stored rawXml, so the
// preview lost the seller's NIP/name entirely once re-parsed in isolation;
// (2) buyer NIP has no P_5B fallback for generators that only populate P_3D.
const flatPodmiot1Sample = `<?xml version="1.0" encoding="UTF-8"?>
<JPK xmlns="http://jpk.mf.gov.pl/wzor/2022/02/17/02171/">
  <Podmiot1>
    <NIP>1541521658</NIP>
    <PelnaNazwa>SoftTech Services Sp. z o.o.</PelnaNazwa>
  </Podmiot1>
  <Faktura typ="G">
    <P_1>2026-08-03</P_1>
    <P_2A>FV/2026/08/002</P_2A>
    <P_3A>Kancelaria Podatkowa Wektor Sp. k.</P_3A>
    <P_3B>al. Jerozolimskie 45, 00-692 Warszawa</P_3B>
    <P_3C>PL</P_3C>
    <P_3D>1234567890</P_3D>
    <P_15>1845.00</P_15>
  </Faktura>
  <FakturaWiersz typ="G">
    <P_2B>FV/2026/08/002</P_2B>
    <P_7>Konsultacje architektoniczne Bazy Danych</P_7>
    <P_8A>usł.</P_8A>
    <P_8B>1</P_8B>
    <P_9A>1500.00</P_9A>
    <P_11>1500.00</P_11>
    <P_12>23</P_12>
  </FakturaWiersz>
</JPK>`;

test("flat Podmiot1 + P_3D-as-buyer-NIP sample: seller identity survives per-invoice serialization and buyer NIP falls back to P_3D", () => {
  const result = parseJpkFaSalesInvoices(flatPodmiot1Sample);
  assert.equal(result.sellerNip, "1541521658");
  assert.equal(result.invoices.length, 1);

  const [invoice] = result.invoices;
  assert.equal(invoice.buyerNip, "1234567890");
  assert.equal(invoice.buyerName, "Kancelaria Podatkowa Wektor Sp. k.");

  const details = parseInvoiceDetails(invoice.rawXml);
  assert.equal(details.seller.nip, "1541521658");
  assert.equal(details.seller.name, "SoftTech Services Sp. z o.o.");
  // P_3C ("PL", the buyer's country code in this file's convention) must
  // never leak into the seller's name/address just because a different,
  // unverified sample once used those tags for the seller instead.
  assert.notEqual(details.seller.name, "PL");
  assert.equal(details.seller.address, null);
  assert.equal(details.buyer.nip, "1234567890");
  assert.equal(details.buyer.name, "Kancelaria Podatkowa Wektor Sp. k.");
  assert.equal(details.buyer.address, "al. Jerozolimskie 45, 00-692 Warszawa");
  assert.equal(details.lines.length, 1);
  assert.equal(details.lines[0].netAmount, 1500);
});
