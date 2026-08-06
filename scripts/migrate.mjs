import { createHash, randomBytes, scrypt } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function secret(name) {
  const value = (await readFile(required(name), "utf8")).trim();
  if (!value) throw new Error(`Secret file is empty: ${name}`);
  return value;
}

async function hashPassword(password) {
  if (password.length < 12 || password.length > 256) {
    throw new Error("Supervisor password must contain between 12 and 256 characters");
  }

  const salt = randomBytes(24);
  const derivedKey = await new Promise((resolvePassword, rejectPassword) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, value) => (error ? rejectPassword(error) : resolvePassword(value)),
    );
  });

  return `scrypt$32768$8$1$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

function safeIdentifier(name, value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid PostgreSQL identifier in ${name}`);
  }
  return value;
}

const host = required("DATABASE_HOST");
const port = Number(process.env.DATABASE_PORT ?? 5432);
const database = safeIdentifier("DATABASE_NAME", required("DATABASE_NAME"));
const adminUser = safeIdentifier("DATABASE_ADMIN_USER", required("DATABASE_ADMIN_USER"));
const appUser = safeIdentifier("DATABASE_USER", required("DATABASE_USER"));
if (appUser !== "epito_app") {
  throw new Error("DATABASE_USER must be epito_app for the bundled migrations");
}
const [adminPassword, appPassword] = await Promise.all([
  secret("DATABASE_ADMIN_PASSWORD_FILE"),
  secret("DATABASE_PASSWORD_FILE"),
]);

const client = new Client({
  host,
  port,
  database,
  user: adminUser,
  password: adminPassword,
  application_name: "epito-migrator",
  connectionTimeoutMillis: 10_000,
  statement_timeout: 120_000,
});

await client.connect();

try {
  await client.query("select pg_advisory_lock(hashtext('epito_schema_migrations'))");

  const roleExists = await client.query(
    "select 1 from pg_roles where rolname = $1",
    [appUser],
  );
  if (roleExists.rowCount === 0) {
    await client.query(`create role ${appUser} login nosuperuser nocreatedb nocreaterole nobypassrls`);
  }

  const passwordLiteral = await client.query(
    "select quote_literal($1) as value",
    [appPassword],
  );
  await client.query(
    `alter role ${appUser} with login nosuperuser nocreatedb nocreaterole noinherit nobypassrls password ${passwordLiteral.rows[0].value}`,
  );
  await client.query(`alter role ${appUser} set statement_timeout = '30s'`);
  await client.query(`alter role ${appUser} set idle_in_transaction_session_timeout = '30s'`);
  await client.query(`grant connect on database ${database} to ${appUser}`);

  await client.query("create schema if not exists epito_meta");
  await client.query(`
    create table if not exists epito_meta.schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const migrationsDirectory = resolve("db/postgres/migrations");
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of migrationNames) {
    const sql = await readFile(resolve(migrationsDirectory, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "select checksum from epito_meta.schema_migrations where name = $1",
      [name],
    );

    if (existing.rowCount === 1) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Previously applied migration changed: ${name}`);
      }
      console.log(`Migration already applied: ${name}`);
      continue;
    }

    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into epito_meta.schema_migrations (name, checksum) values ($1, $2)",
        [name, checksum],
      );
      await client.query("commit");
      console.log(`Migration applied: ${name}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  const supervisorEmail = process.env.SUPERVISOR_EMAIL?.trim().toLowerCase();
  const supervisorPasswordFile = process.env.SUPERVISOR_PASSWORD_FILE?.trim();
  if (supervisorEmail || supervisorPasswordFile) {
    if (!supervisorEmail || !supervisorPasswordFile) {
      throw new Error("SUPERVISOR_EMAIL and SUPERVISOR_PASSWORD_FILE must be configured together");
    }

    const supervisorPassword = (await readFile(supervisorPasswordFile, "utf8")).trim();
    const passwordHash = await hashPassword(supervisorPassword);
    await client.query("begin");
    try {
      const existingSupervisor = await client.query(
        "select id from users where lower(email) = $1 and deleted_at is null limit 1",
        [supervisorEmail],
      );

      let supervisorId;
      if (existingSupervisor.rowCount === 1) {
        supervisorId = existingSupervisor.rows[0].id;
        await client.query(
          "update users set status = 'active', platform_role = 'supervisor', updated_at = now() where id = $1",
          [supervisorId],
        );
      } else {
        const inserted = await client.query(
          "insert into users (email, full_name, status, platform_role) values ($1, $2, 'active', 'supervisor') returning id",
          [supervisorEmail, process.env.SUPERVISOR_NAME?.trim() || "GrimorDev"],
        );
        supervisorId = inserted.rows[0].id;
      }

      await client.query(
        `
          insert into user_credentials (user_id, password_hash)
          values ($1, $2)
          on conflict (user_id) do update
            set password_hash = excluded.password_hash,
                password_changed_at = now(),
                updated_at = now()
        `,
        [supervisorId, passwordHash],
      );
      await client.query("commit");
      console.log("Supervisor account synchronized.");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.query("select pg_advisory_unlock(hashtext('epito_schema_migrations'))").catch(() => undefined);
  await client.end();
}
