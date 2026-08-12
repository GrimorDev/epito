import { NextRequest, NextResponse } from "next/server";
import { clientIp, isSameOrigin } from "@/lib/server/auth";
import { consumeRateLimit } from "@/lib/server/security-store";
import { enqueueLeadNotification } from "@/lib/server/queues";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMPANIES_RANGES = new Set(["do 30", "31-100", "powyżej 100"]);

// Public, unauthenticated endpoint — the only enqueue call site in the app
// with no session behind it. isSameOrigin still applies (blocks third-party
// sites from POSTing here), plus a per-IP rate limit and a honeypot field
// against bots, since this triggers a real Resend send per submission.
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.website === "string" && body.website.trim()) {
    // Honeypot tripped — pretend success so the bot doesn't retry, but never enqueue anything.
    return NextResponse.json({ ok: true });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const companiesRange = typeof body?.clients === "string" && COMPANIES_RANGES.has(body.clients) ? body.clients : "31-100";
  if (name.length < 2 || name.length > 120 || !EMAIL_PATTERN.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Uzupełnij prawidłowe imię i nazwisko oraz e-mail." }, { status: 400 });
  }

  const ipLimit = await consumeRateLimit("lead-ip", clientIp(request), 5, 3600);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele zgłoszeń z tego miejsca. Spróbuj ponownie później." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  await enqueueLeadNotification({ name, email, companiesRange });
  return NextResponse.json({ ok: true }, { status: 201 });
}
