import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/server/database";
import { clientIp, isSameOrigin } from "@/lib/server/auth";
import { hashPassword, validatePassword } from "@/lib/server/passwords";
import { consumeRateLimit } from "@/lib/server/security-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const limit = await consumeRateLimit("account-activation", clientIp(request), 10, 600);
  if (!limit.allowed) return NextResponse.json({ error: "Zbyt wiele prób. Spróbuj ponownie później." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return NextResponse.json({ error: "Link aktywacyjny jest nieprawidłowy." }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const passwordHash = await hashPassword(password);
  try {
    const pool = await getPool();
    const result = await pool.query<{ user_id: string; email: string; tenant_slug: string }>(
      "select * from epito_accept_client_invitation($1, $2)",
      [tokenHash, passwordHash],
    );
    if (!result.rows[0]) throw new Error("INVALID_INVITATION");
    return NextResponse.json({ ok: true, email: result.rows[0].email, tenantSlug: result.rows[0].tenant_slug });
  } catch (error) {
    const databaseCode = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (databaseCode === "22023" || databaseCode === "23505" || (error instanceof Error && error.message === "INVALID_INVITATION")) {
      return NextResponse.json({ error: "Link wygasł, został już użyty albo konto istnieje. Poproś biuro o nowe zaproszenie." }, { status: 409 });
    }
    console.error("Account activation failed", error);
    return NextResponse.json({ error: "Nie udało się aktywować konta." }, { status: 500 });
  }
}
