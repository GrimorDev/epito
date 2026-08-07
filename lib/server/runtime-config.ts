import { readFile } from "node:fs/promises";

type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

type RedisConfig = {
  host: string;
  port: number;
  password: string;
};

const secretCache = new Map<string, Promise<string>>();

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function environmentPort(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`Invalid port in environment variable: ${name}`);
  }
  return value;
}

async function readSecret(name: string): Promise<string> {
  const secretPath = requiredEnvironment(name);
  const existing = secretCache.get(secretPath);
  if (existing) return existing;

  const pending = readFile(secretPath, "utf8").then((value) => {
    const secret = value.trim();
    if (!secret) throw new Error(`Secret file is empty: ${name}`);
    return secret;
  });
  secretCache.set(secretPath, pending);
  return pending;
}

export async function getDatabaseConfig(): Promise<DatabaseConfig> {
  return {
    host: requiredEnvironment("DATABASE_HOST"),
    port: environmentPort("DATABASE_PORT", 5432),
    database: requiredEnvironment("DATABASE_NAME"),
    user: requiredEnvironment("DATABASE_USER"),
    password: await readSecret("DATABASE_PASSWORD_FILE"),
    ssl: process.env.DATABASE_SSL === "require",
  };
}

export async function getRedisConfig(): Promise<RedisConfig> {
  return {
    host: requiredEnvironment("REDIS_HOST"),
    port: environmentPort("REDIS_PORT", 6379),
    password: await readSecret("REDIS_PASSWORD_FILE"),
  };
}

export async function getKsefEncryptionKey(): Promise<Buffer> {
  const encoded = await readSecret("KSEF_ENCRYPTION_KEY_FILE");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("KSEF_ENCRYPTION_KEY_FILE must decode to exactly 32 bytes (base64)");
  }
  return key;
}
