import { XMLBuilder } from "fast-xml-parser";
import {
  deepFind,
  deepFindAll,
  findFirstNumber,
  findFirstString,
  findFirstIsoDate,
  findNip,
  lenientXmlParser,
} from "./xml-utils";

// JPK_FA is the Ministry of Finance's standardized sales-invoice audit-file
// export that every Polish accounting program (Comarch, Insert, Symfonia,
// ...) can produce — used here as a no-API bridge for those systems, since
// none of them expose a self-service integration API the way KSeF does.
//
// Unlike the KSeF FA(2)/FA(3) invoice schema (verified against a real
// downloaded XSD from ksef.podatki.gov.pl), the exact JPK_FA envelope field
// names below are best-effort: I could not locate a machine-readable JPK_FA
// XSD to verify against, only its shared VAT-invoice data model. A missing
// field resolves to null rather than throwing, so a wrong guess degrades
// gracefully instead of breaking the import — check against a real exported
// file and adjust the candidate key lists here if a field comes back empty.
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false, format: true });

export type JpkFaInvoice = {
  invoiceNumber: string | null;
  issuedAt: string | null;
  grossAmount: number | null;
  currency: string;
  buyerNip: string | null;
  buyerName: string | null;
  paymentDueDate: string | null;
  rawXml: string;
};

export type JpkFaFile = {
  sellerNip: string | null;
  invoices: JpkFaInvoice[];
};

function serializeInvoiceXml(invoiceNode: unknown): string {
  return xmlBuilder.build({ Faktura: invoiceNode });
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

  // The filer's NIP is constant across the whole file (JPK_FA covers one
  // taxpayer's sales invoices) — try the file-level subject first, then fall
  // back to whatever the first invoice's own seller block says.
  const sellerNip = findNip(parsed, "Podmiot1") ?? findNip(invoiceNodes[0], "Podmiot1");

  const invoices: JpkFaInvoice[] = invoiceNodes.map((node) => {
    const buyer = deepFind(node, "Podmiot2");
    return {
      invoiceNumber: findFirstString(node, ["P_2A", "P_2"]),
      issuedAt: findFirstString(node, ["P_1"]),
      grossAmount: findFirstNumber(node, ["P_15"]),
      currency: findFirstString(node, ["KodWaluty"]) || "PLN",
      buyerNip: findNip(node, "Podmiot2") ?? findFirstString(node, ["NrKontrahenta"]),
      buyerName: findFirstString(buyer, ["Nazwa", "ImieNazwisko"]) ?? findFirstString(node, ["NazwaKontrahenta"]),
      paymentDueDate: findFirstIsoDate(deepFind(node, "TerminPlatnosci")),
      rawXml: serializeInvoiceXml(node),
    };
  });

  return { sellerNip, invoices };
}
