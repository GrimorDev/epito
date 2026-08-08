import { XMLBuilder } from "fast-xml-parser";
import type { InvoiceDetails, InvoiceLineItem } from "./ksef/client";

// Builds a KSeF FA(3) e-invoice (schemat_FA(3)_v1-0E.xsd) for a single
// domestic VAT sales invoice — the only case this MVP issues. Anything the
// schema requires beyond that (corrections, advances, JST, EORI, VAT-UE,
// margin scheme, new means of transport) is genuinely optional per the XSD
// (minOccurs="0") and is simply omitted; the handful of "does this apply"
// markers under Adnotacje that the schema DOES require are always emitted
// with their "not applicable" value, since this MVP never triggers them.
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false, format: true });

export type InvoiceVatRate = "23" | "8" | "5" | "0" | "zw";

// TStawkaPodatku enum value written into <P_12> — distinct from the P_13/P_14
// grouping key below because the XSD spells the 0% domestic rate "0 KR".
const VAT_RATE_XML_VALUE: Record<InvoiceVatRate, string> = {
  "23": "23",
  "8": "8",
  "5": "5",
  "0": "0 KR",
  zw: "zw",
};

// Which P_13_x/P_14_x pair (Fa-level VAT-rate subtotal) a line's rate rolls
// up into. 0% and "zw" (exempt) have no P_14 (tax) field — there's no VAT to
// sum for a rate that charges none.
const VAT_GROUP: Record<InvoiceVatRate, 1 | 2 | 3 | "13_6_1" | "13_7"> = {
  "23": 1,
  "8": 2,
  "5": 3,
  "0": "13_6_1",
  zw: "13_7",
};

export type InvoiceLineInput = {
  name: string;
  quantity: number;
  unit: string;
  netUnitPrice: number;
  vatRate: InvoiceVatRate;
};

export type IssuedInvoiceInput = {
  invoiceNumber: string;
  issuedAt: string; // YYYY-MM-DD
  currency: string;
  seller: { nip: string; name: string; address: string };
  buyer: { nip: string | null; name: string; address: string | null };
  lines: InvoiceLineInput[];
  dueDate?: string | null;
  bankAccountNumber?: string | null;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function lineNetAmount(line: InvoiceLineInput): number {
  return round2(line.quantity * line.netUnitPrice);
}

export type InvoiceTotals = {
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
};

export function computeInvoiceTotals(lines: InvoiceLineInput[]): InvoiceTotals {
  let netTotal = 0;
  let vatTotal = 0;
  for (const line of lines) {
    const net = lineNetAmount(line);
    netTotal = round2(netTotal + net);
    if (line.vatRate !== "0" && line.vatRate !== "zw") {
      vatTotal = round2(vatTotal + round2(net * (Number(line.vatRate) / 100)));
    }
  }
  return { netTotal, vatTotal, grossTotal: round2(netTotal + vatTotal) };
}

function buildAdres(address: string): Record<string, unknown> {
  return { KodKraju: "PL", AdresL1: address };
}

function buildPodmiot2Identity(buyer: IssuedInvoiceInput["buyer"]): Record<string, unknown> {
  if (buyer.nip) return { NIP: buyer.nip };
  // BrakID = "podmiot nie posiada identyfikatora podatkowego" — the only
  // schema-valid option for a consumer buyer without a NIP.
  return { BrakID: "1" };
}

export function buildFa3InvoiceXml(input: IssuedInvoiceInput): string {
  const vatGroups: Record<string, { net: number; vat: number }> = {};
  for (const line of input.lines) {
    const net = lineNetAmount(line);
    const group = String(VAT_GROUP[line.vatRate]);
    const bucket = vatGroups[group] ?? { net: 0, vat: 0 };
    bucket.net = round2(bucket.net + net);
    if (line.vatRate !== "0" && line.vatRate !== "zw") {
      bucket.vat = round2(bucket.vat + round2(net * (Number(line.vatRate) / 100)));
    }
    vatGroups[group] = bucket;
  }

  const totals = computeInvoiceTotals(input.lines);

  const fa: Record<string, unknown> = {
    KodWaluty: input.currency,
    P_1: input.issuedAt,
    P_2: input.invoiceNumber,
  };
  if (vatGroups["1"]) {
    fa.P_13_1 = vatGroups["1"].net.toFixed(2);
    fa.P_14_1 = vatGroups["1"].vat.toFixed(2);
  }
  if (vatGroups["2"]) {
    fa.P_13_2 = vatGroups["2"].net.toFixed(2);
    fa.P_14_2 = vatGroups["2"].vat.toFixed(2);
  }
  if (vatGroups["3"]) {
    fa.P_13_3 = vatGroups["3"].net.toFixed(2);
    fa.P_14_3 = vatGroups["3"].vat.toFixed(2);
  }
  if (vatGroups["13_6_1"]) fa.P_13_6_1 = vatGroups["13_6_1"].net.toFixed(2);
  if (vatGroups["13_7"]) fa.P_13_7 = vatGroups["13_7"].net.toFixed(2);
  fa.P_15 = totals.grossTotal.toFixed(2);

  // Required "does this apply" markers (Adnotacje) — all "not applicable"
  // for a plain domestic VAT sales invoice, which is all this MVP issues.
  fa.Adnotacje = {
    P_16: "2", // cash method: no
    P_17: "2", // self-billing: no
    P_18: "2", // reverse charge: no
    P_18A: "2", // split payment mechanism: no
    Zwolnienie: { P_19N: "1" }, // no VAT exemption on this invoice
    NoweSrodkiTransportu: { P_22N: "1" }, // no new means of transport
    P_23: "2", // simplified triangulation: no
    PMarzy: { P_PMarzyN: "1" }, // no margin scheme
  };
  fa.RodzajFaktury = "VAT";

  if (input.dueDate || input.bankAccountNumber) {
    const platnosc: Record<string, unknown> = {};
    if (input.dueDate) platnosc.TerminPlatnosci = input.dueDate;
    if (input.bankAccountNumber) platnosc.RachunekBankowy = { NrRB: input.bankAccountNumber };
    fa.Platnosc = platnosc;
  }

  fa.FaWiersz = input.lines.map((line, index) => {
    const net = lineNetAmount(line);
    return {
      NrWierszaFa: index + 1,
      P_7: line.name,
      P_8A: line.unit,
      P_8B: String(line.quantity),
      P_9A: line.netUnitPrice.toFixed(2),
      P_11: net.toFixed(2),
      P_12: VAT_RATE_XML_VALUE[line.vatRate],
    };
  });

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  const faktura = {
    Faktura: {
      Naglowek: {
        KodFormularza: { "@_kodSystemowy": "FA (3)", "@_wersjaSchemy": "1-0E", "#text": "FA" },
        WariantFormularza: 3,
        DataWytworzeniaFa: now,
      },
      Podmiot1: {
        DaneIdentyfikacyjne: { NIP: input.seller.nip, Nazwa: input.seller.name },
        Adres: buildAdres(input.seller.address),
      },
      Podmiot2: {
        DaneIdentyfikacyjne: { ...buildPodmiot2Identity(input.buyer), Nazwa: input.buyer.name },
        ...(input.buyer.address ? { Adres: buildAdres(input.buyer.address) } : {}),
      },
      Fa: fa,
    },
  };

  return xmlBuilder.build(faktura);
}

export function invoiceInputToDetails(input: IssuedInvoiceInput): InvoiceDetails {
  const totals = computeInvoiceTotals(input.lines);
  const lines: InvoiceLineItem[] = input.lines.map((line) => ({
    name: line.name,
    quantity: String(line.quantity),
    unit: line.unit,
    netUnitPrice: line.netUnitPrice,
    netAmount: lineNetAmount(line),
    vatRate: line.vatRate,
  }));

  return {
    invoiceNumber: input.invoiceNumber,
    issuedAt: input.issuedAt,
    currency: input.currency,
    seller: { nip: input.seller.nip, name: input.seller.name, address: input.seller.address },
    buyer: { nip: input.buyer.nip, name: input.buyer.name, address: input.buyer.address },
    lines,
    grossAmount: totals.grossTotal,
    paymentDueDate: input.dueDate ?? null,
  };
}
