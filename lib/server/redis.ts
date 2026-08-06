import Redis from "ioredis";
import { getRedisConfig } from "./runtime-config";

let redisPromise: Promise<Redis> | undefined;

async function createRedis(): Promise<Redis> {
  const config = await getRedisConfig();
  const redis = new Redis({
    ...config,
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    commandTimeout: 5_000,
    connectionName: "epito-web",
  });

  redis.on("error", (error) => {
    console.error("Redis connection error", error);
  });
  await redis.connect();
  return redis;
}

export function getRedis(): Promise<Redis> {
  redisPromise ??= createRedis();
  return redisPromise;
}

export async function checkRedis() {
  const startedAt = performance.now();
  const redis = await getRedis();
  const response = await redis.ping();
  if (response !== "PONG") throw new Error("Redis ping failed");
  return { latencyMs: Math.round(performance.now() - startedAt) };
}
