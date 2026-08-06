import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getRedis } from "./redis";

const key = (...parts: string[]) => ["epito", ...parts].join(":");

export async function consumeRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
) {
  const redis = await getRedis();
  const redisKey = key("rate", scope, createHash("sha256").update(identifier).digest("hex"));
  const result = (await redis.eval(
    `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
      return {current, redis.call('TTL', KEYS[1])}
    `,
    1,
    redisKey,
    windowSeconds,
  )) as [number, number];

  return {
    allowed: result[0] <= limit,
    remaining: Math.max(0, limit - result[0]),
    retryAfterSeconds: Math.max(0, result[1]),
  };
}

export async function createOtpChallenge(ttlSeconds = 300) {
  const redis = await getRedis();
  const challengeId = randomBytes(24).toString("base64url");
  const code = String(randomInt(100_000, 1_000_000));
  const codeHash = createHash("sha256").update(code).digest("hex");
  await redis.set(key("otp", challengeId), codeHash, "EX", ttlSeconds, "NX");
  return { challengeId, code, expiresInSeconds: ttlSeconds };
}

export async function consumeOtpChallenge(challengeId: string, code: string) {
  const redis = await getRedis();
  const storedHash = await redis.getdel(key("otp", challengeId));
  if (!storedHash) return false;

  const suppliedHash = createHash("sha256").update(code).digest();
  const expectedHash = Buffer.from(storedHash, "hex");
  return (
    suppliedHash.length === expectedHash.length &&
    timingSafeEqual(suppliedHash, expectedHash)
  );
}

export async function revokeSession(sessionId: string, ttlSeconds: number) {
  const redis = await getRedis();
  await redis.set(key("revoked-session", sessionId), "1", "EX", ttlSeconds);
}

export async function isSessionRevoked(sessionId: string) {
  const redis = await getRedis();
  return (await redis.exists(key("revoked-session", sessionId))) === 1;
}
