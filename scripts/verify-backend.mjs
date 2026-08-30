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
const clientUserA = randomUUID();
const supervisorId = randomUUID();
const helpdeskId = randomUUID();
const developerId = randomUUID();
const companyA = randomUUID();
const companyAOther = randomUUID();
const companyB = randomUUID();
const documentA = randomUUID();
const documentAOther = randomUUID();

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

  await admin.query("truncate audit_log, outbox_events, payments, documents, client_company_memberships, client_companies, tenant_memberships, user_credentials, users, tenants restart identity cascade");
  await admin.query(
    "insert into tenants (id, slug, legal_name, display_name) values ($1, 'tenant-a', 'Tenant A sp. z o.o.', 'Tenant A'), ($2, 'tenant-b', 'Tenant B sp. z o.o.', 'Tenant B')",
    [tenantA, tenantB],
  );
  await admin.query(
    "insert into users (id, email, full_name, status) values ($1, 'a@example.test', 'User A', 'active'), ($2, 'b@example.test', 'User B', 'active'), ($3, 'client-a@example.test', 'Client A', 'active')",
    [userA, userB, clientUserA],
  );
  await admin.query(
    "insert into users (id, email, full_name, status, platform_role) values ($1, 'supervisor@example.test', 'Supervisor', 'active', 'supervisor')",
    [supervisorId],
  );
  await admin.query(
    "insert into users (id, email, full_name, status, platform_role) values ($1, 'helpdesk@example.test', 'Helpdesk', 'active', 'helpdesk'), ($2, 'developer@example.test', 'Developer', 'active', 'developer')",
    [helpdeskId, developerId],
  );
  await admin.query(
    "insert into user_credentials (user_id, password_hash) values ($1, 'scrypt$32768$8$1$ci-salt$ci-hash')",
    [supervisorId],
  );
  await admin.query(
    "insert into tenant_memberships (tenant_id, user_id, role, access_scope) values ($1, $2, 'owner', 'tenant'), ($3, $4, 'owner', 'tenant'), ($1, $5, 'viewer', 'assigned_companies')",
    [tenantA, userA, tenantB, userB, clientUserA],
  );
  await admin.query(
    "insert into client_companies (id, tenant_id, name, nip) values ($1, $2, 'Company A', '1111111111'), ($3, $2, 'Company A Other', '3333333333'), ($4, $5, 'Company B', '2222222222')",
    [companyA, tenantA, companyAOther, companyB, tenantB],
  );
  await admin.query(
    "insert into client_company_memberships (tenant_id, client_company_id, user_id, role) values ($1, $2, $3, 'viewer')",
    [tenantA, companyA, clientUserA],
  );
  await admin.query(
    `insert into documents (id, tenant_id, client_company_id, name, category, source, status, storage_key, mime_type, file_size, checksum_sha256, document_year, document_month)
     values ($1, $2, $3, 'Client visible.pdf', 'costs', 'upload', 'verified', 'a/visible.pdf', 'application/pdf', 10, repeat('a', 64), 2026, 8),
            ($4, $2, $5, 'Other hidden.pdf', 'costs', 'upload', 'verified', 'a/hidden.pdf', 'application/pdf', 10, repeat('b', 64), 2026, 8)`,
    [documentA, tenantA, companyA, documentAOther, companyAOther],
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
  assert.equal(visibleCompanies.rowCount, 2);
  assert.deepEqual(visibleCompanies.rows.map((row) => row.id).sort(), [companyA, companyAOther].sort());

  await assert.rejects(
    app.query(
      "insert into client_companies (tenant_id, name) values ($1, 'Cross-tenant write')",
      [tenantB],
    ),
    (error) => error?.code === "42501",
  );
  await app.query("rollback");

  const invitationTokenHash = "c".repeat(64);
  await app.query("begin");
  await app.query(
    "select set_config('app.current_tenant_id', $1, true), set_config('app.current_user_id', $2, true)",
    [tenantA, userA],
  );
  const invitation = await app.query(
    "select epito_create_client_invitation($1, 'invited-client@example.test', 'Invited Client', 'viewer', $2, now() + interval '1 day') as id",
    [companyA, invitationTokenHash],
  );
  assert.equal(invitation.rowCount, 1);
  await app.query("commit");

  const acceptedInvitation = await app.query(
    "select * from epito_accept_client_invitation($1, 'scrypt$32768$8$1$ci-salt$ci-hash')",
    [invitationTokenHash],
  );
  assert.equal(acceptedInvitation.rowCount, 1);
  const invitedUserId = acceptedInvitation.rows[0].user_id;
  const invitedMembership = await admin.query(
    "select role, access_scope from tenant_memberships where tenant_id = $1 and user_id = $2",
    [tenantA, invitedUserId],
  );
  assert.deepEqual(invitedMembership.rows[0], { role: "viewer", access_scope: "assigned_companies" });
  assert.equal((await admin.query("select 1 from client_company_memberships where client_company_id = $1 and user_id = $2", [companyA, invitedUserId])).rowCount, 1);
  await assert.rejects(
    app.query("select * from epito_accept_client_invitation($1, 'another-hash')", [invitationTokenHash]),
    (error) => error?.code === "22023",
  );

  await app.query("begin");
  await app.query(
    "select set_config('app.current_tenant_id', $1, true), set_config('app.current_user_id', $2, true)",
    [tenantA, userA],
  );
  await assert.rejects(
    app.query("update users set platform_role = 'supervisor' where id = $1", [userA]),
    (error) => error?.code === "42501",
  );
  await app.query("rollback");

  await app.query("begin");
  await app.query(
    "select set_config('app.current_tenant_id', $1, true), set_config('app.current_user_id', $2, true)",
    [tenantA, clientUserA],
  );
  const assignedCompanies = await app.query("select id from client_companies order by name");
  assert.deepEqual(assignedCompanies.rows.map((row) => row.id), [companyA]);
  const assignedDocuments = await app.query("select id from documents order by name");
  assert.deepEqual(assignedDocuments.rows.map((row) => row.id), [documentA]);
  const assignedMemberships = await app.query("select user_id from tenant_memberships");
  assert.deepEqual(assignedMemberships.rows.map((row) => row.user_id), [clientUserA]);
  await assert.rejects(
    app.query("update documents set name = 'Forbidden edit' where id = $1", [documentA]),
    (error) => error?.code === "42501",
  );
  await app.query("rollback");

  await app.query("begin");
  await app.query(
    "select set_config('app.current_tenant_id', '', true), set_config('app.current_user_id', $1, true)",
    [helpdeskId],
  );
  assert.equal((await app.query("select id from documents")).rowCount, 0);
  assert.equal((await app.query("select id from payments")).rowCount, 0);
  await app.query("rollback");

  await app.query("begin");
  await app.query(
    "select set_config('app.current_tenant_id', '', true), set_config('app.current_user_id', $1, true)",
    [developerId],
  );
  assert.equal((await app.query("select id from documents")).rowCount, 2);
  await app.query("rollback");

  await app.query("begin");
  await app.query(
    "select set_config('app.current_tenant_id', '', true), set_config('app.current_user_id', $1, true)",
    [supervisorId],
  );
  const supervisorVisibleTenants = await app.query("select id from tenants order by slug");
  assert.equal(supervisorVisibleTenants.rowCount, 2);
  const loginIdentity = await app.query(
    "select user_id, platform_role, auth_version from epito_get_login_identity('SUPERVISOR@example.test')",
  );
  assert.equal(loginIdentity.rows[0].user_id, supervisorId);
  assert.equal(loginIdentity.rows[0].platform_role, "supervisor");
  assert.equal(loginIdentity.rows[0].auth_version, 1);
  assert.equal((await app.query("select * from epito_validate_session($1, null, 1)", [supervisorId])).rowCount, 1);
  assert.equal((await app.query("select * from epito_validate_session($1, null, 2)", [supervisorId])).rowCount, 0);
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
