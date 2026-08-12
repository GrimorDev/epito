import assert from "node:assert/strict";
import test from "node:test";
import { interpretWhitelistResponse } from "../lib/server/whitelist/client.ts";

// The four response shapes below were captured from real, live calls to
// wl-api.mf.gov.pl during design of this feature (GET /api/check/nip/{nip}/
// bank-account/{account}?date=...) — not guessed from documentation. See
// the plan for the exact NIP/account pairs used (PKN Orlen vs. KGHM).

test("interpretWhitelistResponse maps a real TAK response to confirmed", () => {
  const body = { result: { accountAssigned: "TAK", requestId: "NBV1t-988hm69", requestDateTime: "12-08-2026 12:16:57" } };
  const outcome = interpretWhitelistResponse(true, body);
  assert.deepEqual(outcome, { status: "confirmed", requestId: "NBV1t-988hm69", message: null });
});

test("interpretWhitelistResponse maps a real NIE response to mismatch", () => {
  const body = { result: { accountAssigned: "NIE", requestId: "rYPnD-988hm79", requestDateTime: "12-08-2026 12:17:21" } };
  const outcome = interpretWhitelistResponse(true, body);
  assert.deepEqual(outcome, { status: "mismatch", requestId: "rYPnD-988hm79", message: null });
});

test("interpretWhitelistResponse maps a real malformed-NIP 400 to invalid_input, not mismatch", () => {
  const body = { code: "WL-113", message: "Pole 'NIP' ma nieprawidłową długość. Wymagane 10 znaków." };
  const outcome = interpretWhitelistResponse(false, body);
  assert.deepEqual(outcome, { status: "invalid_input", requestId: null, message: "Pole 'NIP' ma nieprawidłową długość. Wymagane 10 znaków." });
});

test("interpretWhitelistResponse maps a real malformed-account 400 to invalid_input, not mismatch", () => {
  const body = { code: "WL-111", message: "Nieprawidłowy numer konta bankowego." };
  const outcome = interpretWhitelistResponse(false, body);
  assert.deepEqual(outcome, { status: "invalid_input", requestId: null, message: "Nieprawidłowy numer konta bankowego." });
});

test("interpretWhitelistResponse falls back to check_failed on an unrecognized shape", () => {
  assert.deepEqual(interpretWhitelistResponse(true, null), { status: "check_failed", requestId: null, message: null });
  assert.deepEqual(interpretWhitelistResponse(false, "<html>502 Bad Gateway</html>"), { status: "check_failed", requestId: null, message: null });
});
