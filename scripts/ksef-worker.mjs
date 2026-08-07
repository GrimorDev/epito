import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "bullmq";
import Redis from "ioredis";
import pg from "pg";
import { decryptSecret, encryptSecret } from "./lib/crypto-secrets.mjs";
import {
  KsefApiError,
  authenticateWithToken,
  refreshAccessToken,
  queryInvoiceMetadata,
  fetchInvoice,
  parseInvoiceSummary,
} from "./lib/ksef-client.mjs";

const { Pool } = pg;

async function secret(name) {
  const file = process.env[name]?.trim();
  if (!file) throw new Error(`Missing ${name}`);
  const value = (await readFile(file, "utf8")).trim();
  if (!value) throw new Error(`Empty ${name}`);
  return value;
}

const databasePassword = await secret("DATABASE_PASSWORD_FILE");
const redisPassword = await secret("REDIS_PASSWORD_FILE");
const encryptionKey = Buffer.from(await secret("KSEF_ENCRYPTION_KEY_FILE"), "base64");
if (encryptionKey.length !== 32) {
  throw new Error("KSEF_ENCRYPTION_KEY_FILE must decode to exactly 32 bytes (base64)");
}
const uploadsRoot = path.resolve(process.env.EPITO_UPLOADS_DIR?.trim() || "/app/data/uploads");

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 5432),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: databasePassword,
  ssl: process.env.DATABASE_SSL === "require",
  application_name: "epito-ksef-worker",
  max: 2,
});
const connection = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT || 6379),
  password: redisPassword,
  maxRetriesPerRequest: null,
  connectionName: "epito-ksef-worker",
});

async function withTenant(tenantId, userId, callback) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_tenant_id', $1, true), set_config('app.current_user_id', $2, true)", [tenantId, userId || ""]);
    const value = await callback(client);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function isoDateOnly(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

function yearMonthOf(isoDate) {
  const parsed = isoDate ? new Date(isoDate) : new Date();
  const valid = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return { year: valid.getUTCFullYear(), month: valid.getUTCMonth() + 1 };
}

async function saveInvoiceFile(tenantId, xml, isoDate) {
  const { year, month } = yearMonthOf(isoDate);
  const relativeKey = `${tenantId}/${year}/${String(month).padStart(2, "0")}/${randomUUID()}.xml`;
  const absolutePath = path.resolve(uploadsRoot, relativeKey);
  if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) throw new Error("Invalid invoice storage path");
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const buffer = Buffer.from(xml, "utf8");
  await writeFile(absolutePath, buffer, { flag: "wx" });
  return { relativeKey, buffer, year, month };
}

async function authenticate(connectionRow) {
  const environment = connectionRow.environment;
  if (connectionRow.access_token_ciphertext && connectionRow.refresh_token_ciphertext) {
    const accessTokenExpiresAt = connectionRow.access_token_expires_at ? new Date(connectionRow.access_token_expires_at) : null;
    if (accessTokenExpiresAt && accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
      return {
        accessToken: decryptSecret(connectionRow.access_token_ciphertext, encryptionKey),
        accessTokenExpiresAt,
        refreshToken: decryptSecret(connectionRow.refresh_token_ciphertext, encryptionKey),
        refreshTokenExpiresAt: connectionRow.refresh_token_expires_at ? new Date(connectionRow.refresh_token_expires_at) : null,
      };
    }
    const refreshTokenExpiresAt = connectionRow.refresh_token_expires_at ? new Date(connectionRow.refresh_token_expires_at) : null;
    if (refreshTokenExpiresAt && refreshTokenExpiresAt.getTime() > Date.now() + 60_000) {
      try {
        const refreshToken = decryptSecret(connectionRow.refresh_token_ciphertext, encryptionKey);
        const refreshed = await refreshAccessToken(environment, refreshToken);
        return { ...refreshed, refreshToken, refreshTokenExpiresAt };
      } catch (error) {
        console.warn(`KSeF token refresh failed for connection ${connectionRow.id}, falling back to full auth`, error);
      }
    }
  }
  const ksefToken = decryptSecret(connectionRow.token_ciphertext, encryptionKey);
  return authenticateWithToken(environment, connectionRow.nip, ksefToken);
}

async function handleKsefSync(job) {
  const connectionId = String(job.data.payload?.connectionId || "");
  if (!connectionId) throw new Error("Missing connectionId");
  const tenantId = job.data.tenantId;
  const actorUserId = job.data.actorUserId || null;

  const connectionRow = await withTenant(tenantId, actorUserId, async (client) => {
    const result = await client.query(
      "select id, tenant_id, client_company_id, environment, nip, token_ciphertext, access_token_ciphertext, access_token_expires_at, refresh_token_ciphertext, refresh_token_expires_at, last_synced_at from ksef_connections where id = $1",
      [connectionId],
    );
    return result.rows[0] || null;
  });
  if (!connectionRow) {
    console.warn(`KSeF connection ${connectionId} not found, skipping job`);
    return;
  }

  try {
    const auth = await authenticate(connectionRow);
    const dateTo = new Date();
    const maxLookback = new Date(dateTo);
    maxLookback.setUTCMonth(maxLookback.getUTCMonth() - 3, maxLookback.getUTCDate() + 1);
    const lastSynced = connectionRow.last_synced_at ? new Date(connectionRow.last_synced_at) : null;
    const dateFrom = lastSynced && lastSynced > maxLookback ? lastSynced : maxLookback;

    const newInvoices = [];
    for (const [subjectType, category] of [["Subject1", "sales"], ["Subject2", "costs"]]) {
      let pageOffset = 0;
      const maxPages = 20;
      for (let page = 0; page < maxPages; page += 1) {
        const { invoices, hasMore } = await queryInvoiceMetadata(connectionRow.environment, auth.accessToken, {
          subjectType,
          dateFrom,
          dateTo,
          pageOffset,
        });
        for (const invoice of invoices) newInvoices.push({ ...invoice, category });
        if (!hasMore || invoices.length === 0) break;
        pageOffset += invoices.length;
      }
    }

    const documentsToInsert = [];
    for (const invoice of newInvoices) {
      const alreadyStored = await withTenant(tenantId, actorUserId, async (client) => {
        const result = await client.query(
          "select 1 from documents where tenant_id = $1 and client_company_id = $2 and ksef_number = $3 and deleted_at is null",
          [tenantId, connectionRow.client_company_id, invoice.ksefNumber],
        );
        return result.rowCount > 0;
      });
      if (alreadyStored) continue;

      let xml;
      try {
        xml = await fetchInvoice(connectionRow.environment, auth.accessToken, invoice.ksefNumber);
      } catch (error) {
        console.error(`Failed to fetch KSeF invoice ${invoice.ksefNumber}`, error);
        continue;
      }

      let summary = { issuedAt: null, grossAmount: null, currency: null };
      try {
        summary = parseInvoiceSummary(xml);
      } catch (error) {
        console.warn(`Failed to parse KSeF invoice ${invoice.ksefNumber}, storing raw XML for manual review`, error);
      }

      const issuedAt = isoDateOnly(invoice.issueDate) || isoDateOnly(summary.issuedAt);
      const amount = invoice.grossAmount ?? summary.grossAmount ?? null;
      const currency = invoice.currency ?? summary.currency ?? "PLN";
      const status = amount !== null && issuedAt !== null ? "verified" : "requires_action";

      const stored = await saveInvoiceFile(tenantId, xml, issuedAt);
      const checksum = createHash("sha256").update(stored.buffer).digest("hex");

      documentsToInsert.push({
        ksefNumber: invoice.ksefNumber,
        name: `Faktura KSeF ${invoice.ksefNumber}`,
        category: invoice.category,
        status,
        storageKey: stored.relativeKey,
        fileSize: stored.buffer.length,
        checksum,
        documentYear: stored.year,
        documentMonth: stored.month,
        issuedAt,
        amount,
        currency,
      });
    }

    await withTenant(tenantId, actorUserId, async (client) => {
      for (const document of documentsToInsert) {
        await client.query(
          `insert into documents (
            tenant_id, client_company_id, created_by, name, category, source, status,
            storage_key, mime_type, file_size, checksum_sha256, document_year, document_month,
            issued_at, amount, currency, ksef_number, structured_data
          ) values ($1, $2, $3, $4, $5, 'ksef', $6, $7, 'application/xml', $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)`,
          [
            tenantId,
            connectionRow.client_company_id,
            actorUserId,
            document.name,
            document.category,
            document.status,
            document.storageKey,
            document.fileSize,
            document.checksum,
            document.documentYear,
            document.documentMonth,
            document.issuedAt,
            document.amount,
            document.currency,
            document.ksefNumber,
            JSON.stringify({ ksef: { synced_at: new Date().toISOString(), environment: connectionRow.environment } }),
          ],
        );
      }

      await client.query(
        `update ksef_connections set
          status = 'connected', last_synced_at = now(), last_error = null,
          access_token_ciphertext = $1, access_token_expires_at = $2,
          refresh_token_ciphertext = $3, refresh_token_expires_at = $4,
          updated_at = now()
        where id = $5`,
        [
          encryptSecret(auth.accessToken, encryptionKey),
          auth.accessTokenExpiresAt,
          encryptSecret(auth.refreshToken, encryptionKey),
          auth.refreshTokenExpiresAt,
          connectionId,
        ],
      );

      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'ksef.synced', 'ksef_connection', $3, jsonb_build_object('new_documents', $4::int))",
        [tenantId, actorUserId, connectionId, documentsToInsert.length],
      );
    });
  } catch (error) {
    const message = error instanceof KsefApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Nieznany błąd synchronizacji KSeF";
    await withTenant(tenantId, actorUserId, async (client) => {
      await client.query(
        "update ksef_connections set status = 'error', last_error = $1, updated_at = now() where id = $2",
        [message.slice(0, 500), connectionId],
      );
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'ksef.sync_failed', 'ksef_connection', $3, jsonb_build_object('error', $4::text))",
        [tenantId, actorUserId, connectionId, message.slice(0, 500)],
      );
    });
    throw error;
  }
}

async function processJob(job) {
  if (job.name !== "ksef.sync") return;
  await handleKsefSync(job);
}

const worker = new Worker("integrations", processJob, {
  connection,
  prefix: "epito",
  concurrency: 1,
  lockDuration: 300_000,
});

worker.on("completed", (job) => console.log(`Integration job ${job.id} (${job.name}) completed`));
worker.on("failed", (job, error) => console.error(`Integration job ${job?.id || "unknown"} (${job?.name || "unknown"}) failed`, error));

async function shutdown() {
  await worker.close();
  await connection.quit();
  await pool.end();
}

process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
