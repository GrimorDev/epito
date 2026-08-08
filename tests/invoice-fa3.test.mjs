import assert from "node:assert/strict";
import test from "node:test";
import { XMLParser } from "fast-xml-parser";
import { buildFa3InvoiceXml, computeInvoiceTotals, invoiceInputToDetails } from "../lib/server/invoice-fa3.ts";

// parseTagValue: false preserves exact string content (KSeF validates the
// serialized text, e.g. "500.00" vs "1234567890", not a re-parsed JS number).
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });

const sampleInput = {
  invoiceNumber: "FV/2026/08/001",
  issuedAt: "2026-08-08",
  currency: "PLN",
  seller: { nip: "1234567890", name: "Kancelaria Testowa Sp. z o.o.", address: "ul. Testowa 1, 00-001 Warszawa" },
  buyer: { nip: "9876543210", name: "Klient Testowy S.A.", address: "ul. Kliencka 2, 00-002 Warszawa" },
  lines: [
    { name: "Usługa księgowa", quantity: 1, unit: "usł.", netUnitPrice: 1000, vatRate: "23" },
    { name: "Książka podatkowa", quantity: 2, unit: "szt.", netUnitPrice: 50, vatRate: "8" },
  ],
  dueDate: "2026-08-22",
  bankAccountNumber: "61109010140000071219812874",
};

test("computeInvoiceTotals sums net/vat/gross per line, grouped correctly by rate", () => {
  const totals = computeInvoiceTotals(sampleInput.lines);
  // 1000 net @23% = 230 vat; 100 net @8% = 8 vat
  assert.equal(totals.netTotal, 1100);
  assert.equal(totals.vatTotal, 238);
  assert.equal(totals.grossTotal, 1338);
});

test("buildFa3InvoiceXml produces a schema-shaped FA(3) invoice with both VAT-rate subtotal groups", () => {
  const xml = buildFa3InvoiceXml(sampleInput);
  const parsed = parser.parse(xml);
  const fa = parsed.Faktura.Fa;

  assert.equal(parsed.Faktura["@_xmlns"], "http://crd.gov.pl/wzor/2025/06/25/13775/");
  assert.equal(parsed.Faktura.Naglowek.WariantFormularza, "3");
  assert.equal(parsed.Faktura.Podmiot1.DaneIdentyfikacyjne.NIP, "1234567890");
  assert.equal(parsed.Faktura.Podmiot2.DaneIdentyfikacyjne.NIP, "9876543210");
  // Required markers on Podmiot2 itself (siblings of DaneIdentyfikacyjne),
  // in schema order: JST then GV.
  assert.equal(parsed.Faktura.Podmiot2.JST, "2");
  assert.equal(parsed.Faktura.Podmiot2.GV, "2");

  assert.equal(fa.P_2, "FV/2026/08/001");
  assert.equal(fa.P_13_1, "1000.00");
  assert.equal(fa.P_14_1, "230.00");
  assert.equal(fa.P_13_2, "100.00");
  assert.equal(fa.P_14_2, "8.00");
  assert.equal(fa.P_15, "1338.00");
  assert.equal(fa.RodzajFaktury, "VAT");

  // Required "not applicable" markers must always be present, or KSeF rejects
  // the XML outright regardless of the invoice's actual content.
  assert.equal(fa.Adnotacje.P_16, "2");
  assert.equal(fa.Adnotacje.P_17, "2");
  assert.equal(fa.Adnotacje.P_18, "2");
  assert.equal(fa.Adnotacje.P_18A, "2");
  assert.equal(fa.Adnotacje.Zwolnienie.P_19N, "1");
  assert.equal(fa.Adnotacje.NoweSrodkiTransportu.P_22N, "1");
  assert.equal(fa.Adnotacje.P_23, "2");
  assert.equal(fa.Adnotacje.PMarzy.P_PMarzyN, "1");

  assert.equal(fa.Platnosc.TerminPlatnosci.Termin, "2026-08-22");
  assert.equal(fa.Platnosc.RachunekBankowy.NrRB, "61109010140000071219812874");

  const wiersze = Array.isArray(fa.FaWiersz) ? fa.FaWiersz : [fa.FaWiersz];
  assert.equal(wiersze.length, 2);
  assert.equal(wiersze[0].P_7, "Usługa księgowa");
  assert.equal(wiersze[0].P_12, "23");
  assert.equal(wiersze[1].P_12, "8");

  // FaWiersz must come before Platnosc in the Fa sequence (confirmed against
  // the real XSD with lxml) — a plain object-shape assertion can't catch
  // element ordering, since parsing loses that information, so this checks
  // the raw serialized text directly. Getting this backwards is exactly the
  // bug that made KSeF reject every invoice with a due date or bank account.
  assert.ok(xml.indexOf("<FaWiersz") < xml.indexOf("<Platnosc"), "FaWiersz must precede Platnosc in the emitted XML");
});

test("buyer without a NIP gets BrakID instead of an empty/invalid NIP element", () => {
  const xml = buildFa3InvoiceXml({
    ...sampleInput,
    buyer: { nip: null, name: "Jan Kowalski", address: null },
  });
  const parsed = parser.parse(xml);
  assert.equal(parsed.Faktura.Podmiot2.DaneIdentyfikacyjne.BrakID, "1");
  assert.equal(parsed.Faktura.Podmiot2.DaneIdentyfikacyjne.NIP, undefined);
  assert.equal(parsed.Faktura.Podmiot2.Adres, undefined);
});

test("0% and exempt (zw) rates group into P_13_6_1/P_13_7 with no P_14 tax field", () => {
  const xml = buildFa3InvoiceXml({
    ...sampleInput,
    lines: [
      { name: "Eksport towaru", quantity: 1, unit: "szt.", netUnitPrice: 500, vatRate: "0" },
      { name: "Usługa zwolniona", quantity: 1, unit: "usł.", netUnitPrice: 200, vatRate: "zw" },
    ],
  });
  const parsed = parser.parse(xml);
  const fa = parsed.Faktura.Fa;
  assert.equal(fa.P_13_6_1, "500.00");
  assert.equal(fa.P_13_7, "200.00");
  assert.equal(fa.P_14_1, undefined);
  assert.equal(fa.P_15, "700.00");

  const wiersze = Array.isArray(fa.FaWiersz) ? fa.FaWiersz : [fa.FaWiersz];
  assert.equal(wiersze[0].P_12, "0 KR");
  assert.equal(wiersze[1].P_12, "zw");
});

test("invoiceInputToDetails maps cleanly onto the existing InvoiceDetails preview/PDF renderer shape", () => {
  const details = invoiceInputToDetails(sampleInput);
  assert.equal(details.invoiceNumber, "FV/2026/08/001");
  assert.equal(details.seller.nip, "1234567890");
  assert.equal(details.buyer.name, "Klient Testowy S.A.");
  assert.equal(details.grossAmount, 1338);
  assert.equal(details.paymentDueDate, "2026-08-22");
  assert.equal(details.lines.length, 2);
  assert.equal(details.lines[0].netAmount, 1000);
  assert.equal(details.lines[1].netAmount, 100);
});
