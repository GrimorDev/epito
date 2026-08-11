import { NextRequest, NextResponse } from "next/server";
import { findLoginIdentity, listUserMemberships } from "@/lib/server/accounts";
import {
  clientIp,
  createSession,
  isProductionBackendEnabled,
  isSameOrigin,
  resolveRequestHost,
  resolveTenantSlugFromHost,
  setSessionCookie,
} from "@/lib/server/auth";
import { verifyPassword } from "@/lib/server/passwords";
import { consumeRateLimit } from "@/lib/server/security-store";
import { isPlatformStaff } from "@/lib/platform-access";
import { withUserTransaction } from "@/lib/server/database";

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

  await withUserTransaction(identity.userId, (client) =>
    client.query("update users set last_login_at = now(), updated_at = now() where id = $1", [identity.userId]),
  );

  const memberships = await listUserMemberships(identity.userId);

  // Each tenant gets its own portal subdomain (client2393.epito.pl) and a
  // regular member may only log in through it — logging in on the bare
  // domain, or another tenant's subdomain, must fail even with the right
  // password. Supervisors manage the platform from the main domain and
  // aren't tenant members, so this doesn't apply to them.
  //
  // Enforcement only activates once EPITO_BASE_DOMAIN is actually configured
  // — without it, resolveTenantSlugFromHost can never match anything, and
  // this must fall back to today's behavior rather than locking every
  // regular user out because the operator hasn't finished DNS/subdomain
  // setup yet.
  const baseDomainConfigured = Boolean(process.env.EPITO_BASE_DOMAIN?.trim());
  const hostSlug = resolveTenantSlugFromHost(resolveRequestHost(request));
  const matchedMembership = hostSlug
    ? memberships.find((membership) => membership.tenantSlug === hostSlug) ?? null
    : null;

  if (!isPlatformStaff(identity.platformRole)) {
    if (!memberships.length) {
      return NextResponse.json({ error: "Konto nie ma dostępu do żadnej organizacji." }, { status: 403 });
    }
    if (baseDomainConfigured && !matchedMembership) {
      return NextResponse.json({ error: "To konto nie jest przypisane do tej organizacji." }, { status: 403 });
    }
  }

  const primaryMembership = matchedMembership ?? memberships[0] ?? null;

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
    redirectTo: isPlatformStaff(identity.platformRole) ? "/admin" : "/workspace",
  });
  setSessionCookie(response, request, token);
  return response;
}
