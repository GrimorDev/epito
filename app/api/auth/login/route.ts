import { NextRequest, NextResponse } from "next/server";
import { findLoginIdentity, listUserMemberships } from "@/lib/server/accounts";
import {
  clientIp,
  createSession,
  isProductionBackendEnabled,
  isSameOrigin,
  setSessionCookie,
} from "@/lib/server/auth";
import { verifyPassword } from "@/lib/server/passwords";
import { consumeRateLimit } from "@/lib/server/security-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isProductionBackendEnabled()) {
    return NextResponse.json({ error: "Tryb produkcyjny jest wyłączony." }, { status: 503 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password || email.length > 254 || password.length > 256) {
    return NextResponse.json({ error: "Nieprawidłowy e-mail lub hasło." }, { status: 400 });
  }

  const [ipLimit, accountLimit] = await Promise.all([
    consumeRateLimit("login-ip", clientIp(request), 20, 600),
    consumeRateLimit("login-account", email, 5, 600),
  ]);
  if (!ipLimit.allowed || !accountLimit.allowed) {
    return NextResponse.json(
      { error: "Zbyt wiele prób logowania. Spróbuj ponownie później." },
      { status: 429, headers: { "Retry-After": String(Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds)) } },
    );
  }

  const identity = await findLoginIdentity(email);
  const authenticated = identity
    ? await verifyPassword(password, identity.passwordHash)
    : false;
  if (!identity || !authenticated) {
    return NextResponse.json({ error: "Nieprawidłowy e-mail lub hasło." }, { status: 401 });
  }

  const memberships = await listUserMemberships(identity.userId);
  const primaryMembership = memberships[0] ?? null;
  if (identity.platformRole !== "supervisor" && !primaryMembership) {
    return NextResponse.json({ error: "Konto nie ma dostępu do żadnej organizacji." }, { status: 403 });
  }

  const token = await createSession({
    userId: identity.userId,
    email: identity.email,
    fullName: identity.fullName,
    platformRole: identity.platformRole,
    tenantId: primaryMembership?.tenantId ?? null,
    tenantSlug: primaryMembership?.tenantSlug ?? null,
    tenantName: primaryMembership?.tenantName ?? null,
    membershipRole: primaryMembership?.membershipRole ?? null,
  });

  const response = NextResponse.json({
    ok: true,
    redirectTo: identity.platformRole === "supervisor" ? "/supervisor" : "/workspace",
  });
  setSessionCookie(response, request, token);
  return response;
}
