import { X509Certificate, constants as cryptoConstants, publicEncrypt, type KeyObject } from "node:crypto";
import {
  deepFind,
  deepFindAll,
  findAddress,
  findFirstIsoDate,
  findFirstNip,
  findFirstNumber,
  findFirstString,
  findNip,
  lenientXmlParser,
} from "../xml-utils";

// Endpoint paths and payload shapes below were verified against the Ministry
// of Finance's published OpenAPI spec (github.com/CIRFMF/ksef-api/open-api.json).
// Re-check that spec before adjusting anything here if KSeF ships a new API version.
export type KsefEnvironment = "test" | "demo" | "production";
export type KsefSubjectType = "Subject1" | "Subject2";

const ENVIRONMENT_BASE_URLS: Record<KsefEnvironment, string> = {
  test: "https://api-test.ksef.mf.gov.pl/api/v2",
  demo: "https://api-demo.ksef.mf.gov.pl/api/v2",
  production: "https://api.ksef.mf.gov.pl/api/v2",
};

export class KsefApiError extends Error {
  readonly step: string;
  readonly statusCode?: number;
  readonly details?: unknown;

  constructor(message: string, step: string, statusCode?: number, details?: unknown) {
    super(message);
    this.name = "KsefApiError";
    this.step = step;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function getEnvironmentBaseUrl(environment: KsefEnvironment): string {
  return ENVIRONMENT_BASE_URLS[environment];
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson<T>(url: string, init: RequestInit, step: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new KsefApiError(`Nie udało się połączyć z KSeF (${step}).`, step, undefined, error);
  }

  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;
  if (!response.ok) {
    throw new KsefApiError(`KSeF zwrócił błąd (${step}): HTTP ${response.status}`, step, response.status, body);
  }
  return body as T;
}

function expectField<T>(value: T | undefined | null, field: string, step: string): T {
  if (value === undefined || value === null) {
    throw new KsefApiError(`Odpowiedź KSeF (${step}) nie zawiera oczekiwanego pola "${field}".`, step);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encryptKsefToken(ksefToken: string, timestampMs: number, publicKey: KeyObject): string {
  const payload = Buffer.from(`${ksefToken}|${timestampMs}`, "utf8");
  const encrypted = publicEncrypt(
    { key: publicKey, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    payload,
  );
  return encrypted.toString("base64");
}

async function fetchTokenEncryptionCertificate(
  baseUrl: string,
): Promise<{ publicKey: KeyObject; publicKeyId: string }> {
  const result = await requestJson<Array<{ certificate?: string; publicKeyId?: string; usage?: string[] }>>(
    `${baseUrl}/security/public-key-certificates`,
    { method: "GET" },
    "security.publicKeyCertificates",
  );
  const match = result.find((cert) => cert.usage?.includes("KsefTokenEncryption"));
  if (!match?.certificate || !match.publicKeyId) {
    throw new KsefApiError(
      "KSeF nie zwrócił certyfikatu do szyfrowania tokenu (usage=KsefTokenEncryption).",
      "security.publicKeyCertificates",
    );
  }
  const derCertificate = Buffer.from(match.certificate, "base64");
  return { publicKey: new X509Certificate(derCertificate).publicKey, publicKeyId: match.publicKeyId };
}

async function requestChallenge(baseUrl: string): Promise<{ challenge: string; timestampMs: number }> {
  const result = await requestJson<{ challenge?: string; timestampMs?: number }>(
    `${baseUrl}/auth/challenge`,
    { method: "POST" },
    "auth.challenge",
  );
  return {
    challenge: expectField(result.challenge, "challenge", "auth.challenge"),
    timestampMs: expectField(result.timestampMs, "timestampMs", "auth.challenge"),
  };
}

async function pollAuthenticationStatus(
  baseUrl: string,
  authenticationToken: string,
  referenceNumber: string,
): Promise<void> {
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await requestJson<{ status?: { code?: number; description?: string } }>(
      `${baseUrl}/auth/${encodeURIComponent(referenceNumber)}`,
      { method: "GET", headers: { Authorization: `Bearer ${authenticationToken}` } },
      "auth.status",
    );
    const code = status.status?.code;
    if (code !== undefined && code >= 200 && code < 300) return;
    if (code !== undefined && code >= 400) {
      throw new KsefApiError(
        `Uwierzytelnianie KSeF nie powiodło się: ${status.status?.description ?? code}`,
        "auth.status",
        code,
      );
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new KsefApiError("Przekroczono czas oczekiwania na potwierdzenie uwierzytelnienia KSeF.", "auth.status");
}

export type KsefAuthResult = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

export async function authenticateWithToken(
  environment: KsefEnvironment,
  nip: string,
  ksefToken: string,
): Promise<KsefAuthResult> {
  const baseUrl = getEnvironmentBaseUrl(environment);
  const { publicKey, publicKeyId } = await fetchTokenEncryptionCertificate(baseUrl);
  const challenge = await requestChallenge(baseUrl);
  const encryptedToken = encryptKsefToken(ksefToken, challenge.timestampMs, publicKey);

  const submitted = await requestJson<{
    referenceNumber?: string;
    authenticationToken?: { token?: string; validUntil?: string };
  }>(
    `${baseUrl}/auth/ksef-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge: challenge.challenge,
        contextIdentifier: { type: "Nip", value: nip },
        encryptedToken,
        publicKeyId,
      }),
    },
    "auth.ksefToken",
  );

  const referenceNumber = expectField(submitted.referenceNumber, "referenceNumber", "auth.ksefToken");
  const authenticationToken = expectField(
    submitted.authenticationToken?.token,
    "authenticationToken.token",
    "auth.ksefToken",
  );

  await pollAuthenticationStatus(baseUrl, authenticationToken, referenceNumber);

  const redeemed = await requestJson<{
    accessToken?: { token?: string; validUntil?: string };
    refreshToken?: { token?: string; validUntil?: string };
  }>(
    `${baseUrl}/auth/token/redeem`,
    { method: "POST", headers: { Authorization: `Bearer ${authenticationToken}` } },
    "auth.redeem",
  );

  const accessToken = expectField(redeemed.accessToken?.token, "accessToken.token", "auth.redeem");
  const accessTokenValidUntil = expectField(redeemed.accessToken?.validUntil, "accessToken.validUntil", "auth.redeem");
  const refreshToken = expectField(redeemed.refreshToken?.token, "refreshToken.token", "auth.redeem");
  const refreshTokenValidUntil = expectField(redeemed.refreshToken?.validUntil, "refreshToken.validUntil", "auth.redeem");

  return {
    accessToken,
    accessTokenExpiresAt: new Date(accessTokenValidUntil),
    refreshToken,
    refreshTokenExpiresAt: new Date(refreshTokenValidUntil),
  };
}

export async function refreshAccessToken(
  environment: KsefEnvironment,
  refreshToken: string,
): Promise<{ accessToken: string; accessTokenExpiresAt: Date }> {
  const baseUrl = getEnvironmentBaseUrl(environment);
  const result = await requestJson<{ accessToken?: { token?: string; validUntil?: string } }>(
    `${baseUrl}/auth/token/refresh`,
    { method: "POST", headers: { Authorization: `Bearer ${refreshToken}` } },
    "auth.refresh",
  );
  const accessToken = expectField(result.accessToken?.token, "accessToken.token", "auth.refresh");
  const accessTokenValidUntil = expectField(result.accessToken?.validUntil, "accessToken.validUntil", "auth.refresh");
  return { accessToken, accessTokenExpiresAt: new Date(accessTokenValidUntil) };
}

export type InvoiceMetadata = {
  ksefNumber: string;
  issueDate: string;
  sellerNip: string | null;
  buyerIdentifier: string | null;
  grossAmount: number | null;
  currency: string | null;
};

function normalizeInvoiceMetadata(row: Record<string, unknown>): InvoiceMetadata | null {
  const ksefNumber = row.ksefNumber;
  if (typeof ksefNumber !== "string" || !ksefNumber) return null;
  const seller = row.seller as Record<string, unknown> | undefined;
  const buyer = row.buyer as Record<string, unknown> | undefined;
  return {
    ksefNumber,
    issueDate: typeof row.issueDate === "string" ? row.issueDate : new Date().toISOString(),
    sellerNip: typeof seller?.nip === "string" ? seller.nip : null,
    buyerIdentifier: typeof buyer?.identifier === "string" ? buyer.identifier : null,
    grossAmount: typeof row.grossAmount === "number" ? row.grossAmount : null,
    currency: typeof row.currency === "string" ? row.currency : null,
  };
}

export async function queryInvoiceMetadata(
  environment: KsefEnvironment,
  accessToken: string,
  options: { subjectType: KsefSubjectType; dateFrom: Date; dateTo: Date; pageOffset?: number; pageSize?: number },
): Promise<{ invoices: InvoiceMetadata[]; hasMore: boolean }> {
  const baseUrl = getEnvironmentBaseUrl(environment);
  const pageSize = options.pageSize ?? 100;
  const pageOffset = options.pageOffset ?? 0;

  const result = await requestJson<{ hasMore?: boolean; invoices?: Array<Record<string, unknown>> }>(
    `${baseUrl}/invoices/query/metadata?pageOffset=${pageOffset}&pageSize=${pageSize}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectType: options.subjectType,
        dateRange: {
          dateType: "Issue",
          from: options.dateFrom.toISOString(),
          to: options.dateTo.toISOString(),
        },
      }),
    },
    "invoices.query",
  );

  const rows = result.invoices ?? [];
  const invoices = rows
    .map(normalizeInvoiceMetadata)
    .filter((invoice): invoice is InvoiceMetadata => invoice !== null);
  return { invoices, hasMore: result.hasMore ?? false };
}

export async function fetchInvoice(
  environment: KsefEnvironment,
  accessToken: string,
  ksefNumber: string,
): Promise<string> {
  const baseUrl = getEnvironmentBaseUrl(environment);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    throw new KsefApiError(`Nie udało się połączyć z KSeF podczas pobierania faktury ${ksefNumber}.`, "invoices.fetch", undefined, error);
  }
  if (!response.ok) {
    throw new KsefApiError(`Nie udało się pobrać faktury ${ksefNumber} z KSeF: HTTP ${response.status}`, "invoices.fetch", response.status);
  }
  return response.text();
}

export type ParsedInvoiceSummary = {
  issuedAt: string | null;
  grossAmount: number | null;
  currency: string | null;
  sellerNip: string | null;
  buyerNip: string | null;
  paymentDueDate: string | null;
};

// FA(2)/FA(3) field names (P_1, P_15, Podmiot1/Podmiot2, KodWaluty) are best-effort
// based on the published Polish e-invoice schema, used only as a fallback when
// the structured invoice-metadata response (issueDate/grossAmount/currency) is
// incomplete. Fields that can't be located resolve to null rather than throwing.
export function parseInvoiceSummary(xml: string): ParsedInvoiceSummary {
  let parsed: unknown;
  try {
    parsed = lenientXmlParser.parse(xml);
  } catch (error) {
    throw new KsefApiError("Nie udało się przetworzyć XML faktury z KSeF.", "invoice.parse", undefined, error);
  }

  return {
    issuedAt: findFirstString(parsed, ["P_1"]),
    grossAmount: findFirstNumber(parsed, ["P_15"]),
    currency: findFirstString(parsed, ["KodWaluty"]),
    sellerNip: findNip(parsed, "Podmiot1"),
    buyerNip: findNip(parsed, "Podmiot2"),
    paymentDueDate: findFirstIsoDate(deepFind(parsed, "TerminPlatnosci")),
  };
}

export type InvoiceLineItem = {
  name: string | null;
  quantity: string | null;
  unit: string | null;
  netUnitPrice: number | null;
  netAmount: number | null;
  vatRate: string | null;
};

export type InvoiceDetails = {
  invoiceNumber: string | null;
  issuedAt: string | null;
  currency: string | null;
  seller: { nip: string | null; name: string | null; address: string | null };
  buyer: { nip: string | null; name: string | null; address: string | null };
  lines: InvoiceLineItem[];
  grossAmount: number | null;
  paymentDueDate: string | null;
};

// Field codes beyond P_1/P_15/KodWaluty (confirmed against real synced test
// invoices) are best-effort based on the general FA(2) schema and haven't all
// been verified against a real invoice — a missing field resolves to null/an
// empty list rather than breaking the whole preview.
export function parseInvoiceDetails(xml: string): InvoiceDetails {
  let parsed: unknown;
  try {
    parsed = lenientXmlParser.parse(xml);
  } catch (error) {
    throw new KsefApiError("Nie udało się przetworzyć XML faktury z KSeF.", "invoice.parse", undefined, error);
  }

  const seller = deepFind(parsed, "Podmiot1");
  const buyer = deepFind(parsed, "Podmiot2");
  // KSeF's FA schema nests line items as FaWiersz inside the invoice; a
  // JPK_FA import (lib/server/jpk-fa.ts) re-nests its sibling FakturaWiersz
  // records under the same tag it uses at import time — try both.
  const lineNodes = deepFindAll(parsed, "FaWiersz");
  const jpkFaLineNodes = lineNodes.length ? [] : deepFindAll(parsed, "FakturaWiersz");
  const allLineNodes = lineNodes.length ? lineNodes : jpkFaLineNodes;

  return {
    invoiceNumber: findFirstString(parsed, ["P_2A", "P_2"]),
    issuedAt: findFirstString(parsed, ["P_1"]),
    currency: findFirstString(parsed, ["KodWaluty"]),
    // Podmiot1/Podmiot2 are KSeF's nested seller/buyer blocks. A JPK_FA import
    // (lib/server/jpk-fa.ts) carries seller identity as a Podmiot1 block too
    // (copied from the JPK file root onto each stored invoice fragment) but
    // names it PelnaNazwa instead of Nazwa; buyer identity has no nested
    // block at all and instead lives in flat P_3x/P_5x fields on the invoice
    // — fall back to those when the nested lookup finds nothing. P_3C/P_3D
    // are NOT used as a seller fallback here: different JPK_FA(4) generators
    // disagree on what they hold (seen as buyer country/NIP in the wild),
    // so guessing would misattribute buyer data as the seller's.
    seller: {
      nip: findNip(parsed, "Podmiot1") ?? findFirstString(parsed, ["P_4B"]),
      name: findFirstString(seller, ["Nazwa", "PelnaNazwa", "ImieNazwisko"]),
      address: findAddress(seller),
    },
    buyer: {
      // P_5B is the field verified against a real export; P_3D is a fallback
      // seen in some JPK_FA(4) generators that place buyer NIP there instead
      // (validated as NIP-shaped so it can't grab an unrelated string, since
      // other generators use P_3D for the seller's address instead).
      nip: findNip(parsed, "Podmiot2") ?? findFirstString(parsed, ["P_5B"]) ?? findFirstNip(parsed, ["P_3D"]),
      name: findFirstString(buyer, ["Nazwa", "PelnaNazwa", "ImieNazwisko"]) ?? findFirstString(parsed, ["P_3A"]),
      address: findAddress(buyer) ?? findFirstString(parsed, ["P_3B"]),
    },
    lines: allLineNodes.map((line) => ({
      name: findFirstString(line, ["P_7"]),
      quantity: findFirstString(line, ["P_8B"]),
      unit: findFirstString(line, ["P_8A"]),
      netUnitPrice: findFirstNumber(line, ["P_9A"]),
      netAmount: findFirstNumber(line, ["P_11"]),
      vatRate: findFirstString(line, ["P_12"]),
    })),
    grossAmount: findFirstNumber(parsed, ["P_15"]),
    paymentDueDate: findFirstIsoDate(deepFind(parsed, "TerminPlatnosci")),
  };
}
