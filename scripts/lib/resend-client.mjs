// Resend's transactional email API (api.resend.com). Lives here, not in a
// Next.js route, for the same reason as ksef-client.mjs/whitelist-client.mjs:
// scripts/ksef-worker.mjs is the only process with outbound internet egress
// in this deployment.
const RESEND_BASE_URL = "https://api.resend.com";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Never throws — a single failed send shouldn't crash the daily reminder
// scan, just skip that one email and let the caller log/continue.
export async function sendEmail({ apiKey, from, to, subject, html }) {
  if (!apiKey) return { ok: false, error: "Brak klucza API Resend." };
  let response;
  let body = null;
  try {
    response = await fetch(`${RESEND_BASE_URL}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const text = await response.text();
    body = text ? safeJsonParse(text) : null;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Błąd sieci." };
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? body.message : `HTTP ${response.status}`;
    return { ok: false, error: String(message) };
  }
  return { ok: true, id: body && typeof body === "object" && "id" in body ? body.id : null };
}
