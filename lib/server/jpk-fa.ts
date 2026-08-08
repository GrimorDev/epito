import { XMLBuilder } from "fast-xml-parser";
import { deepFindAll, findFirstNumber, findFirstString, findNip, lenientXmlParser } from "./xml-utils";

// JPK_FA is the Ministry of Finance's standardized sales-invoice audit-file
// export that every Polish accounting program (Comarch, Insert, Symfonia,
// ...) can produce — used here as a no-API bridge for those systems, since
// none of them expose a self-service integration API the way KSeF does.
//
// Field names verified against a real JPK_FA(4) export (user-provided
// sample): tags are all-lowercase (unlike KSeF's PascalCase FA schema, hence
// the case-insensitive matching in xml-utils.ts). Buyer identity lives in
// flat fields directly on <faktura> (P_3A name, P_5B NIP) — there is no
// nested "Podmiot2" object the way KSeF's invoice schema has one. JPK_FA
// carries no payment-due-date field at all (P_6 is the sale/completion date,
// not a due date) — it's a VAT audit file, not a payment record.
//
// Invoice line items (<FakturaWiersz>) are NOT nested inside <Faktura> —
// they're sibling records at the JPK root, joined back to their invoice by
// P_2B (on the line) matching P_2A (on the invoice). JPK_FA(3) and JPK_FA(4)
// use near-identical field names, so this one parser covers both variants.
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false, format: true });

export type JpkFaInvoice = {
  invoiceNumber: string | null;
  issuedAt: string | null;
  grossAmount: number | null;
  currency: string;
  buyerNip: string | null;
  buyerName: string | null;
  rawXml: string;
};

export type JpkFaFile = {
  sellerNip: string | null;
  invoices: JpkFaInvoice[];
};

function serializeInvoiceXml(invoiceNode: unknown, lineNodes: unknown[]): string {
  const enriched = { ...(invoiceNode as Record<string, unknown>) };
  if (lineNodes.length) enriched.FakturaWiersz = lineNodes;
  return xmlBuilder.build({ Faktura: enriched });
}

export function parseJpkFaSalesInvoices(xml: string): JpkFaFile {
  let parsed: unknown;
  try {
    parsed = lenientXmlParser.parse(xml);
  } catch {
    throw new Error("Nie udało się przetworzyć pliku jako XML.");
  }

  const invoiceNodes = deepFindAll(parsed, "Faktura");
  if (!invoiceNodes.length) {
    throw new Error("Nie znaleziono żadnych faktur (elementu \"Faktura\") w tym pliku. Sprawdź, czy to plik JPK_FA.");
  }
  const lineNodes = deepFindAll(parsed, "FakturaWiersz");

  // The filer's NIP is constant across the whole file (JPK_FA covers one
  // taxpayer's sales invoices) — try the file-level subject first, then fall
  // back to the seller NIP repeated on the first invoice itself (P_4B).
  const sellerNip = findNip(parsed, "Podmiot1") ?? findFirstString(invoiceNodes[0], ["P_4B"]);

  const invoices: JpkFaInvoice[] = invoiceNodes.map((node) => {
    const invoiceNumber = findFirstString(node, ["P_2A", "P_2"]);
    const matchingLines = invoiceNumber
      ? lineNodes.filter((line) => findFirstString(line, ["P_2B"]) === invoiceNumber)
      : [];
    return {
      invoiceNumber,
      issuedAt: findFirstString(node, ["P_1"]),
      grossAmount: findFirstNumber(node, ["P_15"]),
      currency: findFirstString(node, ["KodWaluty"]) || "PLN",
      buyerNip: findFirstString(node, ["P_5B"]),
      buyerName: findFirstString(node, ["P_3A"]),
      rawXml: serializeInvoiceXml(node, matchingLines),
    };
  });

  return { sellerNip, invoices };
}
