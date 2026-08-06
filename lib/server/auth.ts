import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getRedis } from "./redis";

const SESSION_COOKIE = "epito_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

export type AuthSession = {
  userId: string;
  email: string;
  fullName: string;
  platformRole: "none" | "support" | "supervisor";
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  membershipRole: "owner" | "admin" | "accountant" | "employee" | "viewer" | null;
  createdAt: string;
};

const sessionKey = (token: string) =>
  `epito:session:${createHash("sha256").update(token).digest("hex")}`;

export function isProductionBackendEnabled() {
  return process.env.EPITO_BACKEND_SERVICES === "required";
}

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const supplied = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const expectedHost = forwardedHost || request.headers.get("host") || request.nextUrl.host;
    const expectedProtocol = forwardedProto || request.nextUrl.protocol.replace(":", "");
    return supplied.host === expectedHost && supplied.protocol === `${expectedProtocol}:`;
  } catch {
    return false;
  }
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
    return JSON.parse(rawSession) as AuthSession;
  } catch {
    await redis.del(sessionKey(token));
    return null;
  }
}

export async function updateSessionTenant(
  request: NextRequest,
  tenant: Pick<AuthSession, "tenantId" | "tenantSlug" | "tenantName" | "membershipRole">,
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
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
