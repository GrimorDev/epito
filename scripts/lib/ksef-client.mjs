import { X509Certificate, constants as cryptoConstants, createCipheriv, createHash, publicEncrypt, randomBytes } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

// Mirrors lib/server/ksef/client.ts (kept as plain JS so the worker can run
// without a TypeScript build step, same convention as document-worker.mjs).
// Endpoint paths and payload shapes were verified against the Ministry of
// Finance's published OpenAPI spec (github.com/CIRFMF/ksef-api/open-api.json).
// Re-check that spec before adjusting anything here if KSeF ships a new API version.
const ENVIRONMENT_BASE_URLS = {
  test: "https://api-test.ksef.mf.gov.pl/api/v2",
  demo: "https://api-demo.ksef.mf.gov.pl/api/v2",
  production: "https://api.ksef.mf.gov.pl/api/v2",
};

export class KsefApiError extends Error {
  constructor(message, step, statusCode, details) {
    super(message);
    this.name = "KsefApiError";
    this.step = step;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function getEnvironmentBaseUrl(environment) {
  const baseUrl = ENVIRONMENT_BASE_URLS[environment];
  if (!baseUrl) throw new KsefApiError(`Nieznane środowisko KSeF: ${environment}`, "config");
  return baseUrl;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson(url, init, step) {
  let response;
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
  return body;
}

function expectField(value, field, step) {
  if (value === undefined || value === null) {
    throw new KsefApiError(`Odpowiedź KSeF (${step}) nie zawiera oczekiwanego pola "${field}".`, step);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encryptKsefToken(ksefToken, timestampMs, publicKey) {
  const payload = Buffer.from(`${ksefToken}|${timestampMs}`, "utf8");
  const encrypted = publicEncrypt(
    { key: publicKey, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    payload,
  );
  return encrypted.toString("base64");
}

// KSeF publishes separate certificates per usage: "KsefTokenEncryption" for
// the login-token exchange, "SymmetricKeyEncryption" for the AES session key
// used to encrypt invoice XML — using the wrong one is rejected outright.
async function fetchPublicKeyCertificate(baseUrl, usage) {
  const result = await requestJson(
    `${baseUrl}/security/public-key-certificates`,
    { method: "GET" },
    "security.publicKeyCertificates",
  );
  const match = result.find((cert) => cert.usage?.includes(usage));
  if (!match?.certificate || !match.publicKeyId) {
    throw new KsefApiError(
      `KSeF nie zwrócił certyfikatu do szyfrowania (usage=${usage}).`,
      "security.publicKeyCertificates",
    );
  }
  const derCertificate = Buffer.from(match.certificate, "base64");
  return { publicKey: new X509Certificate(derCertificate).publicKey, publicKeyId: match.publicKeyId };
}

async function requestChallenge(baseUrl) {
  const result = await requestJson(`${baseUrl}/auth/challenge`, { method: "POST" }, "auth.challenge");
  return {
    challenge: expectField(result.challenge, "challenge", "auth.challenge"),
    timestampMs: expectField(result.timestampMs, "timestampMs", "auth.challenge"),
  };
}

async function pollAuthenticationStatus(baseUrl, authenticationToken, referenceNumber) {
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await requestJson(
      `${baseUrl}/auth/${encodeURIComponent(referenceNumber)}`,
      { method: "GET", headers: { Authorization: `Bearer ${authenticationToken}` } },
      "auth.status",
    );
    const code = status.status?.code;
    if (code !== undefined && code >= 200 && code < 300) return;
    if (code !== undefined && code >= 400) {
      throw new KsefApiError(`Uwierzytelnianie KSeF nie powiodło się: ${status.status?.description ?? code}`, "auth.status", code);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new KsefApiError("Przekroczono czas oczekiwania na potwierdzenie uwierzytelnienia KSeF.", "auth.status");
}

export async function authenticateWithToken(environment, nip, ksefToken) {
  const baseUrl = getEnvironmentBaseUrl(environment);
  const { publicKey, publicKeyId } = await fetchPublicKeyCertificate(baseUrl, "KsefTokenEncryption");
  const challenge = await requestChallenge(baseUrl);
  const encryptedToken = encryptKsefToken(ksefToken, challenge.timestampMs, publicKey);

  const submitted = await requestJson(
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
  const authenticationToken = expectField(submitted.authenticationToken?.token, "authenticationToken.token", "auth.ksefToken");

  await pollAuthenticationStatus(baseUrl, authenticationToken, referenceNumber);

  const redeemed = await requestJson(
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

export async function refreshAccessToken(environment, refreshToken) {
  const baseUrl = getEnvironmentBaseUrl(environment);
  const result = await requestJson(
    `${baseUrl}/auth/token/refresh`,
    { method: "POST", headers: { Authorization: `Bearer ${refreshToken}` } },
    "auth.refresh",
  );
  const accessToken = expectField(result.accessToken?.token, "accessToken.token", "auth.refresh");
  const accessTokenValidUntil = expectField(result.accessToken?.validUntil, "accessToken.validUntil", "auth.refresh");
  return { accessToken, accessTokenExpiresAt: new Date(accessTokenValidUntil) };
}

function normalizeInvoiceMetadata(row) {
  const ksefNumber = row.ksefNumber;
  if (typeof ksefNumber !== "string" || !ksefNumber) return null;
  return {
    ksefNumber,
    // "Numer faktury nadany przez wystawcę" — the issuer's own invoice
    // number (our P_2), not a KSeF-generated value. Lets the sync worker
    // recognize invoices Epito itself issued instead of re-importing them
    // as a second, separate document once KSeF starts serving them back.
    invoiceNumber: typeof row.invoiceNumber === "string" ? row.invoiceNumber : null,
    issueDate: typeof row.issueDate === "string" ? row.issueDate : new Date().toISOString(),
    sellerNip: typeof row.seller?.nip === "string" ? row.seller.nip : null,
    buyerIdentifier: typeof row.buyer?.identifier === "string" ? row.buyer.identifier : null,
    grossAmount: typeof row.grossAmount === "number" ? row.grossAmount : null,
    currency: typeof row.currency === "string" ? row.currency : null,
  };
}

export async function queryInvoiceMetadata(environment, accessToken, options) {
  const baseUrl = getEnvironmentBaseUrl(environment);
  const pageSize = options.pageSize ?? 100;
  const pageOffset = options.pageOffset ?? 0;

  const result = await requestJson(
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
  const invoices = rows.map(normalizeInvoiceMetadata).filter((invoice) => invoice !== null);
  return { invoices, hasMore: result.hasMore ?? false };
}

export async function fetchInvoice(environment, accessToken, ksefNumber) {
  const baseUrl = getEnvironmentBaseUrl(environment);
  let response;
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

// --- Interactive session (invoice issuing) ---
// Verified against github.com/CIRFMF/ksef-docs: sesja-interaktywna.md and
// faktury/sesje/sesja-sprawdzenie-stanu-i-pobranie-upo.md. Re-check those
// docs before changing anything here if KSeF ships a new API version.

export async function openOnlineSession(environment, accessToken) {
  const baseUrl = getEnvironmentBaseUrl(environment);
  const { publicKey, publicKeyId } = await fetchPublicKeyCertificate(baseUrl, "SymmetricKeyEncryption");

  // A fresh AES-256 key + 128-bit IV per session, as recommended by KSeF docs.
  const key = randomBytes(32);
  const iv = randomBytes(16);
  const encryptedSymmetricKey = publicEncrypt(
    { key: publicKey, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    key,
  );

  const result = await requestJson(
    `${baseUrl}/sessions/online`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
        encryption: {
          encryptedSymmetricKey: encryptedSymmetricKey.toString("base64"),
          initializationVector: iv.toString("base64"),
          publicKeyId,
        },
      }),
    },
    "sessions.online.open",
  );

  return {
    referenceNumber: expectField(result.referenceNumber, "referenceNumber", "sessions.online.open"),
    validUntil: expectField(result.validUntil, "validUntil", "sessions.online.open"),
    encryption: { key, iv },
  };
}

export async function sendOnlineSessionInvoice(environment, accessToken, sessionReferenceNumber, invoiceXml, encryption) {
  const baseUrl = getEnvironmentBaseUrl(environment);
  const invoiceBuffer = Buffer.from(invoiceXml, "utf8");
  const cipher = createCipheriv("aes-256-cbc", encryption.key, encryption.iv);
  const encryptedInvoice = Buffer.concat([cipher.update(invoiceBuffer), cipher.final()]);

  const result = await requestJson(
    `${baseUrl}/sessions/online/${encodeURIComponent(sessionReferenceNumber)}/invoices`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceHash: createHash("sha256").update(invoiceBuffer).digest("base64"),
        invoiceSize: invoiceBuffer.length,
        encryptedInvoiceHash: createHash("sha256").update(encryptedInvoice).digest("base64"),
        encryptedInvoiceSize: encryptedInvoice.length,
        encryptedInvoiceContent: encryptedInvoice.toString("base64"),
      }),
    },
    "sessions.online.sendInvoice",
  );

  return { referenceNumber: expectField(result.referenceNumber, "referenceNumber", "sessions.online.sendInvoice") };
}

export async function closeOnlineSession(environment, accessToken, sessionReferenceNumber) {
  const baseUrl = getEnvironmentBaseUrl(environment);
  await requestJson(
    `${baseUrl}/sessions/online/${encodeURIComponent(sessionReferenceNumber)}/close`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
    "sessions.online.close",
  );
}

export async function getSessionInvoiceStatus(environment, accessToken, sessionReferenceNumber, invoiceReferenceNumber) {
  const baseUrl = getEnvironmentBaseUrl(environment);
  const result = await requestJson(
    `${baseUrl}/sessions/${encodeURIComponent(sessionReferenceNumber)}/invoices/${encodeURIComponent(invoiceReferenceNumber)}`,
    { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
    "sessions.invoiceStatus",
  );

  return {
    code: expectField(result.status?.code, "status.code", "sessions.invoiceStatus"),
    description: result.status?.description ?? "",
    // On rejection (e.g. code 410) this carries the actual reason, such as
    // "Kontekst X nie jest uprawniony do wystawienia faktury w imieniu
    // sprzedawcy (NIP: Y)" — description alone is too generic to act on.
    details: result.status?.details ?? [],
    ksefNumber: result.ksefNumber ?? null,
    upoDownloadUrl: result.upoDownloadUrl ?? null,
  };
}

// upoDownloadUrl is a presigned link straight to KSeF's storage — per docs it
// must be fetched WITHOUT an Authorization header, unlike every other call.
export async function fetchSessionInvoiceUpo(upoDownloadUrl) {
  let response;
  try {
    response = await fetch(upoDownloadUrl, { method: "GET" });
  } catch (error) {
    throw new KsefApiError("Nie udało się połączyć z KSeF podczas pobierania UPO.", "sessions.upo", undefined, error);
  }
  if (!response.ok) {
    throw new KsefApiError(`Nie udało się pobrać UPO z KSeF: HTTP ${response.status}`, "sessions.upo", response.status);
  }
  return response.text();
}

// parseTagValue: false keeps every leaf as a raw string — otherwise
// fast-xml-parser silently coerces all-digit values (NIP, KSeF numbers) into
// JS numbers, which would corrupt any identifier starting with "0".
const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false });

function deepFind(node, key) {
  if (node === null || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFind(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (key in node) return node[key];
  for (const value of Object.values(node)) {
    const found = deepFind(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findFirstString(node, keys) {
  for (const key of keys) {
    const value = deepFind(node, key);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function findFirstNumber(node, keys) {
  for (const key of keys) {
    const value = deepFind(node, key);
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  }
  return null;
}

function findNip(node, subjectKey) {
  const subject = deepFind(node, subjectKey);
  const nip = deepFind(subject, "NIP");
  return typeof nip === "string" ? nip.trim() : null;
}

function findSubjectName(node, subjectKey) {
  const subject = deepFind(node, subjectKey);
  const name = deepFind(subject, "Nazwa");
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function findFirstIsoDate(node) {
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
export function parseInvoiceSummary(xml) {
  let parsed;
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
    bankAccount: findFirstString(parsed, ["NrRB"]),
    sellerName: findSubjectName(parsed, "Podmiot1"),
  };
}
