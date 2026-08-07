import { X509Certificate, constants as cryptoConstants, publicEncrypt, type KeyObject } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

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

// parseTagValue: false keeps every leaf as a raw string — otherwise
// fast-xml-parser silently coerces all-digit values (NIP, KSeF numbers) into
// JS numbers, which would corrupt any identifier starting with "0".
const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false });

function deepFind(node: unknown, key: string): unknown {
  if (node === null || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFind(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = node as Record<string, unknown>;
  if (key in record) return record[key];
  for (const value of Object.values(record)) {
    const found = deepFind(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findFirstString(node: unknown, keys: string[]): string | null {
  for (const key of keys) {
    const value = deepFind(node, key);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function findFirstNumber(node: unknown, keys: string[]): number | null {
  for (const key of keys) {
    const value = deepFind(node, key);
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return null;
}

function findNip(node: unknown, subjectKey: string): string | null {
  const subject = deepFind(node, subjectKey);
  const nip = deepFind(subject, "NIP");
  return typeof nip === "string" ? nip.trim() : null;
}

function findFirstIsoDate(node: unknown): string | null {
  if (typeof node === "string") {
    const match = node.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstIsoDate(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) {
      const found = findFirstIsoDate(value);
      if (found) return found;
    }
  }
  return null;
}

// FA(2)/FA(3) field names (P_1, P_15, Podmiot1/Podmiot2, KodWaluty) are best-effort
// based on the published Polish e-invoice schema, used only as a fallback when
// the structured invoice-metadata response (issueDate/grossAmount/currency) is
// incomplete. Fields that can't be located resolve to null rather than throwing.
export function parseInvoiceSummary(xml: string): ParsedInvoiceSummary {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
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
