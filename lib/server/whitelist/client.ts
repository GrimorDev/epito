// Endpoint and response shapes verified against the live, public wl-api.mf.gov.pl
// API (no API key required) — not guessed from documentation. Confirmed:
// GET /api/check/nip/{nip}/bank-account/{account}?date=YYYY-MM-DD ->
//   200 {"result":{"accountAssigned":"TAK"|"NIE","requestId":"...","requestDateTime":"..."}}
//   400 {"code":"WL-11x","message":"..."} for malformed NIP/account input.
const WHITELIST_BASE_URL = "https://wl-api.mf.gov.pl/api";

export type WhitelistCheckStatus = "confirmed" | "mismatch" | "invalid_input" | "check_failed";

export type WhitelistCheckOutcome = {
  status: WhitelistCheckStatus;
  requestId: string | null;
  message: string | null;
};

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Pure — no network. "NIE" (account exists but isn't assigned to this NIP) is
// the fraud/mismatch signal this feature exists to catch; a malformed-input
// 400 is a different case and must never be reported as a mismatch.
export function interpretWhitelistResponse(ok: boolean, body: unknown): WhitelistCheckOutcome {
  if (ok && body && typeof body === "object" && "result" in body) {
    const result = (body as { result?: { accountAssigned?: string; requestId?: string } }).result;
    if (result?.accountAssigned === "TAK") return { status: "confirmed", requestId: result.requestId ?? null, message: null };
    if (result?.accountAssigned === "NIE") return { status: "mismatch", requestId: result.requestId ?? null, message: null };
  }
  if (!ok && body && typeof body === "object" && "code" in body) {
    const error = body as { code?: string; message?: string };
    return { status: "invalid_input", requestId: null, message: error.message || error.code || "Nieprawidłowe dane zapytania." };
  }
  return { status: "check_failed", requestId: null, message: null };
}

export async function checkNipBankAccount(nip: string, bankAccount: string, date: string): Promise<WhitelistCheckOutcome> {
  const url = `${WHITELIST_BASE_URL}/check/nip/${encodeURIComponent(nip)}/bank-account/${encodeURIComponent(bankAccount)}?date=${encodeURIComponent(date)}`;
  let response: Response;
  let body: unknown = null;
  try {
    response = await fetch(url);
    const text = await response.text();
    body = text ? safeJsonParse(text) : null;
  } catch (error) {
    return { status: "check_failed", requestId: null, message: error instanceof Error ? error.message : "Błąd sieci." };
  }
  return interpretWhitelistResponse(response.ok, body);
}
