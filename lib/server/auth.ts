import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getRedis } from "./redis";
import { getPool } from "./database";
import type { PlatformRole } from "../platform-access";

const SESSION_COOKIE = "epito_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export type AuthSession = {
  userId: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  membershipRole: "owner" | "admin" | "accountant" | "employee" | "viewer" | null;
  accessScope: "tenant" | "assigned_companies";
  authVersion: number;
  createdAt: string;
};

const sessionKey = (token: string) =>
  `epito:session:${createHash("sha256").update(token).digest("hex")}`;

export function isProductionBackendEnabled() {
  return process.env.EPITO_BACKEND_SERVICES === "required";
}

// Behind the reverse proxy (nginx-proxy-manager, see PORTAINER.md) the real
// requested host arrives as X-Forwarded-Host, not Host — used both for CSRF
// origin checks below and for resolving which tenant's subdomain a request
// came in on.
export function resolveRequestHost(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwardedHost || request.headers.get("host") || request.nextUrl.host;
}

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const supplied = new URL(origin);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const expectedHost = resolveRequestHost(request);
    const expectedProtocol = forwardedProto || request.nextUrl.protocol.replace(":", "");
    return supplied.host === expectedHost && supplied.protocol === `${expectedProtocol}:`;
  } catch {
    return false;
  }
}

// Subdomains that are never a tenant's own portal — reserved for the
// marketing site, platform admin, mail, etc. A request on any of these (or
// on the bare base domain) has no tenant context.
const RESERVED_HOST_LABELS = new Set(["www", "app", "admin", "api", "mail", "ftp"]);

// Extracts "client2393" out of "client2393.epito.pl" (or its :port variant).
// Returns null for the bare base domain, reserved labels, an unrelated
// domain entirely, or when EPITO_BASE_DOMAIN isn't configured — any of which
// means "no tenant-specific portal, this is the main/admin domain".
export function resolveTenantSlugFromHost(hostname: string): string | null {
  const baseDomain = process.env.EPITO_BASE_DOMAIN?.trim().toLowerCase();
  if (!baseDomain) return null;

  const host = hostname.split(":")[0]?.trim().toLowerCase() || "";
  if (!host || host === baseDomain) return null;
  if (!host.endsWith(`.${baseDomain}`)) return null;

  const label = host.slice(0, -(baseDomain.length + 1));
  if (!label || label.includes(".") || RESERVED_HOST_LABELS.has(label)) return null;
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(label)) return null;
  return label;
}

export function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function createSession(session: Omit<AuthSession, "createdAt">) {
  const redis = await getRedis();
  const token = randomBytes(32).toString("base64url");
  const storedSession: AuthSession = {
    ...session,
    createdAt: new Date().toISOString(),
  };
  await redis.set(
    sessionKey(token),
    JSON.stringify(storedSession),
    "EX",
    SESSION_TTL_SECONDS,
  );
  return token;
}

export function setSessionCookie(
  response: NextResponse,
  request: NextRequest,
  token: string,
) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = forwardedProto === "https" || request.nextUrl.protocol === "https:";
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSession(request: NextRequest): Promise<AuthSession | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const redis = await getRedis();
  const rawSession = await redis.get(sessionKey(token));
  if (!rawSession) return null;

  try {
    const stored = JSON.parse(rawSession) as AuthSession;
    if (!stored.userId || !Number.isInteger(stored.authVersion)) {
      await redis.del(sessionKey(token));
      return null;
    }

    const pool = await getPool();
    const validated = await pool.query<{
      email: string;
      full_name: string;
      platform_role: PlatformRole;
      auth_version: number;
      tenant_id: string | null;
      tenant_slug: string | null;
      tenant_name: string | null;
      membership_role: AuthSession["membershipRole"];
      access_scope: AuthSession["accessScope"];
    }>("select * from epito_validate_session($1, $2, $3)", [
      stored.userId,
      stored.tenantId,
      stored.authVersion,
    ]);
    const row = validated.rows[0];
    if (!row) {
      await redis.del(sessionKey(token));
      return null;
    }

    const session: AuthSession = {
      ...stored,
      email: row.email,
      fullName: row.full_name,
      platformRole: row.platform_role,
      authVersion: row.auth_version,
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantName: row.tenant_name,
      membershipRole: row.membership_role,
      accessScope: row.access_scope,
    };
    if (JSON.stringify(session) !== rawSession) {
      await redis.set(sessionKey(token), JSON.stringify(session), "KEEPTTL", "XX");
    }
    return session;
  } catch {
    await redis.del(sessionKey(token));
    return null;
  }
}

export async function updateSessionTenant(
  request: NextRequest,
  tenant: Pick<AuthSession, "tenantId" | "tenantSlug" | "tenantName" | "membershipRole" | "accessScope">,
) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const redis = await getRedis();
  const key = sessionKey(token);
  const rawSession = await redis.get(key);
  if (!rawSession) return null;

  const session = { ...(JSON.parse(rawSession) as AuthSession), ...tenant };
  await redis.set(key, JSON.stringify(session), "KEEPTTL", "XX");
  return session;
}

export async function destroySession(request: NextRequest, response: NextResponse) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const redis = await getRedis();
    await redis.del(sessionKey(token));
  }
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: forwardedProto === "https" || request.nextUrl.protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
