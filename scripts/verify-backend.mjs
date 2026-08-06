import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import Redis from "ioredis";
import { Queue } from "bullmq";

const { Client } = pg;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function secret(name) {
  return (await readFile(required(name), "utf8")).trim();
}

if (process.env.EPITO_ALLOW_DESTRUCTIVE_TESTS !== "true") {
  throw new Error("EPITO_ALLOW_DESTRUCTIVE_TESTS=true is required");
}

const database = required("DATABASE_NAME");
if (!database.endsWith("_ci")) {
  throw new Error("Backend verification is restricted to databases ending in _ci");
}

const commonDatabaseConfig = {
  host: required("DATABASE_HOST"),
  port: Number(process.env.DATABASE_PORT ?? 5432),
  database,
};
const [adminPassword, appPassword, redisPassword] = await Promise.all([
  secret("DATABASE_ADMIN_PASSWORD_FILE"),
  secret("DATABASE_PASSWORD_FILE"),
  secret("REDIS_PASSWORD_FILE"),
]);

const admin = new Client({
  ...commonDatabaseConfig,
  user: required("DATABASE_ADMIN_USER"),
  password: adminPassword,
});
const app = new Client({
  ...commonDatabaseConfig,
  user: required("DATABASE_USER"),
  password: appPassword,
});

const tenantA = randomUUID();
const tenantB = randomUUID();
const userA = randomUUID();
const userB = randomUUID();
const companyA = randomUUID();
const companyB = randomUUID();

await admin.connect();
await app.connect();

try {
  await admin.query("truncate audit_log, outbox_events, payments, documents, client_companies, tenant_memberships, users, tenants restart identity cascade");
  await admin.query(
    "insert into tenants (id, slug, legal_name, display_name) values ($1, 'tenant-a', 'Tenant A sp. z o.o.', 'Tenant A'), ($2, 'tenant-b', 'Tenant B sp. z o.o.', 'Tenant B')",
    [tenantA, tenantB],
  );
  await admin.query(
    "insert into users (id, email, full_name, status) values ($1, 'a@example.test', 'User A', 'active'), ($2, 'b@example.test', 'User B', 'active')",
    [userA, userB],
  );
  await admin.query(
    "insert into tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'owner'), ($3, $4, 'owner')",
    [tenantA, userA, tenantB, userB],
  );
  await admin.query(
    "insert into client_companies (id, tenant_id, name, nip) values ($1, $2, 'Company A', '1111111111'), ($3, $4, 'Company B', '2222222222')",
    [companyA, tenantA, companyB, tenantB],
  );

  const role = await admin.query(
    "select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = 'epito_app'",
  );
  assert.deepEqual(role.rows[0], {
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolbypassrls: false,
  });

  await app.query("begin");
  await app.query(
    "select set_config('app.current_tenant_id', $1, true), set_config('app.current_user_id', $2, true)",
    [tenantA, userA],
  );
  const visibleCompanies = await app.query(
    "select id, tenant_id from client_companies order by name",
  );
  assert.equal(visibleCompanies.rowCount, 1);
  assert.equal(visibleCompanies.rows[0].id, companyA);

  await assert.rejects(
    app.query(
      "insert into client_companies (tenant_id, name) values ($1, 'Cross-tenant write')",
      [tenantB],
    ),
    (error) => error?.code === "42501",
  );
  await app.query("rollback");

  const redis = new Redis({
    host: required("REDIS_HOST"),
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: redisPassword,
    maxRetriesPerRequest: null,
  });

  try {
    assert.equal(await redis.ping(), "PONG");
    const otpKey = `epito:ci:otp:${randomUUID()}`;
    await redis.set(otpKey, "hash", "EX", 30);
    assert.equal(await redis.getdel(otpKey), "hash");
    assert.equal(await redis.get(otpKey), null);

    const queue = new Queue(`ci-${randomUUID()}`, {
      connection: {
        host: required("REDIS_HOST"),
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: redisPassword,
      },
      prefix: "epito-ci",
    });
    try {
      const job = await queue.add("health.check", { tenantId: tenantA });
      const storedJob = await queue.getJob(job.id);
      assert.equal(storedJob?.data.tenantId, tenantA);
      await storedJob?.remove();
    } finally {
      await queue.close();
    }
  } finally {
    await redis.quit();
  }

  console.log("PostgreSQL RLS, restricted role, Redis TTL and BullMQ verified.");
} finally {
  await Promise.allSettled([app.end(), admin.end()]);
}
