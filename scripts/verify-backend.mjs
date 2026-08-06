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
const supervisorId = randomUUID();
const companyA = randomUUID();
const companyB = randomUUID();

await admin.connect();
await app.connect();

try {
  const seededSupervisor = await admin.query(
    "select user_row.platform_role, credentials.password_hash from users user_row join user_credentials credentials on credentials.user_id = user_row.id where lower(user_row.email) = lower($1)",
    [required("SUPERVISOR_EMAIL")],
  );
  assert.equal(seededSupervisor.rowCount, 1);
  assert.equal(seededSupervisor.rows[0].platform_role, "supervisor");
  assert.match(seededSupervisor.rows[0].password_hash, /^scrypt\$32768\$8\$1\$/);

  await admin.query("truncate audit_log, outbox_events, payments, documents, client_companies, tenant_memberships, user_credentials, users, tenants restart identity cascade");
  await admin.query(
    "insert into tenants (id, slug, legal_name, display_name) values ($1, 'tenant-a', 'Tenant A sp. z o.o.', 'Tenant A'), ($2, 'tenant-b', 'Tenant B sp. z o.o.', 'Tenant B')",
    [tenantA, tenantB],
  );
  await admin.query(
    "insert into users (id, email, full_name, status) values ($1, 'a@example.test', 'User A', 'active'), ($2, 'b@example.test', 'User B', 'active')",
    [userA, userB],
  );
  await admin.query(
    "insert into users (id, email, full_name, status, platform_role) values ($1, 'supervisor@example.test', 'Supervisor', 'active', 'supervisor')",
    [supervisorId],
  );
  await admin.query(
    "insert into user_credentials (user_id, password_hash) values ($1, 'scrypt$32768$8$1$ci-salt$ci-hash')",
    [supervisorId],
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

  await app.query("begin");
  await app.query(
    "select set_config('app.current_tenant_id', '', true), set_config('app.current_user_id', $1, true)",
    [supervisorId],
  );
  const supervisorVisibleTenants = await app.query("select id from tenants order by slug");
  assert.equal(supervisorVisibleTenants.rowCount, 2);
  const loginIdentity = await app.query(
    "select user_id, platform_role from epito_get_login_identity('SUPERVISOR@example.test')",
  );
  assert.equal(loginIdentity.rows[0].user_id, supervisorId);
  assert.equal(loginIdentity.rows[0].platform_role, "supervisor");
  const createdTenant = await app.query(
    "select * from epito_create_tenant_with_owner('tenant-created', 'Created sp. z o.o.', 'Created', '3333333333', 'owner@created.test', 'Created Owner', 'scrypt$32768$8$1$ci-salt$ci-hash')",
  );
  assert.equal(createdTenant.rowCount, 1);
  const createdTenantId = createdTenant.rows[0].tenant_id;
  await app.query("commit");

  await app.query("begin");
  await app.query(
    "select set_config('app.current_tenant_id', $1, true), set_config('app.current_user_id', $2, true)",
    [createdTenantId, supervisorId],
  );
  const createdEmployee = await app.query(
    "select epito_create_tenant_user('employee@created.test', 'Created Employee', 'employee', 'scrypt$32768$8$1$ci-salt$ci-hash') as user_id",
  );
  assert.equal(createdEmployee.rowCount, 1);
  await app.query("commit");

  if (process.env.EPITO_SKIP_REDIS_TESTS === "true") {
    console.log("PostgreSQL RLS, supervisor provisioning and restricted role verified; Redis checks explicitly skipped.");
  } else {
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

    console.log("PostgreSQL RLS, supervisor provisioning, restricted role, Redis TTL and BullMQ verified.");
  }
} finally {
  await Promise.allSettled([app.end(), admin.end()]);
}
