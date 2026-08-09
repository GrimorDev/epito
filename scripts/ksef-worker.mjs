import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Queue, Worker } from "bullmq";
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
  openOnlineSession,
  sendOnlineSessionInvoice,
  closeOnlineSession,
  getSessionInvoiceStatus,
  fetchSessionInvoiceUpo,
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
// Used to re-enqueue "invoice.issue" jobs with a delay while polling KSeF for
// asynchronous verification. The API route only creates the issued_invoices
// row and enqueues the initial job — the actual KSeF network calls all
// happen here, since this worker is the only process with KSeF egress.
const invoiceQueue = new Queue("integrations", { connection, prefix: "epito" });

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

function addDaysIso(isoDate, days) {
  const base = isoDate ? new Date(`${isoDate}T00:00:00Z`) : new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

const POLISH_MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

function periodLabel(isoDate) {
  const date = isoDate ? new Date(`${isoDate}T00:00:00Z`) : new Date();
  return `${POLISH_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
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
          "select 1 from documents where tenant_id = $1 and client_company_id = $2 and ksef_number = $3 and category = $4 and deleted_at is null",
          [tenantId, connectionRow.client_company_id, invoice.ksefNumber, invoice.category],
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
      const dueDate = invoice.category === "costs" ? isoDateOnly(summary.paymentDueDate) || addDaysIso(issuedAt, 14) : null;

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
        dueDate,
      });
    }

    await withTenant(tenantId, actorUserId, async (client) => {
      for (const document of documentsToInsert) {
        const inserted = await client.query(
          `insert into documents (
            tenant_id, client_company_id, created_by, name, category, source, status,
            storage_key, mime_type, file_size, checksum_sha256, document_year, document_month,
            issued_at, amount, currency, ksef_number, structured_data
          ) values ($1, $2, $3, $4, $5, 'ksef', $6, $7, 'application/xml', $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
          returning id`,
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

        if (document.category === "costs" && document.amount !== null) {
          await client.query(
            `insert into payments (
              tenant_id, client_company_id, document_id, tax_type, period_label,
              amount, currency, due_date, status, metadata
            ) values ($1, $2, $3, 'invoice', $4, $5, $6, $7, 'due', $8::jsonb)`,
            [
              tenantId,
              connectionRow.client_company_id,
              inserted.rows[0].id,
              periodLabel(document.issuedAt),
              document.amount,
              document.currency,
              document.dueDate,
              JSON.stringify({ source: "ksef", ksef_number: document.ksefNumber }),
            ],
          );
        }
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

const INVOICE_POLL_DELAY_MS = 20_000;
const INVOICE_SUBMIT_FOLLOWUP_DELAY_MS = 15_000;
const INVOICE_MAX_POLL_ATTEMPTS = 40; // ~13 minutes at INVOICE_POLL_DELAY_MS

async function handleInvoiceIssue(job) {
  const invoiceId = String(job.data.payload?.invoiceId || "");
  if (!invoiceId) throw new Error("Missing invoiceId");
  const tenantId = job.data.tenantId;
  const actorUserId = job.data.actorUserId || null;
  const pollAttempts = Number(job.data.payload?.pollAttempts || 0);

  const invoiceRow = await withTenant(tenantId, actorUserId, async (client) => {
    const result = await client.query("select * from issued_invoices where id = $1", [invoiceId]);
    return result.rows[0] || null;
  });
  if (!invoiceRow) {
    console.warn(`Issued invoice ${invoiceId} not found, skipping job`);
    return;
  }
  // "failed" is not terminal here — it only means a previous attempt threw
  // (network blip, KSeF hiccup) and BullMQ is retrying; "accepted"/"rejected"
  // are KSeF's own final answers and must never be reprocessed.
  if (invoiceRow.status === "accepted" || invoiceRow.status === "rejected") return;

  async function markFailed(message) {
    await withTenant(tenantId, actorUserId, async (client) => {
      await client.query(
        "update issued_invoices set status = 'failed', error_message = $1, updated_at = now() where id = $2",
        [message.slice(0, 500), invoiceId],
      );
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'invoice.issue_failed', 'issued_invoice', $3, jsonb_build_object('error', $4::text))",
        [tenantId, actorUserId, invoiceId, message.slice(0, 500)],
      );
    });
  }

  const connectionRow = await withTenant(tenantId, actorUserId, async (client) => {
    const result = await client.query(
      "select id, tenant_id, client_company_id, environment, nip, status, token_ciphertext, access_token_ciphertext, access_token_expires_at, refresh_token_ciphertext, refresh_token_expires_at from ksef_connections where tenant_id = $1 and client_company_id = $2",
      [tenantId, invoiceRow.client_company_id],
    );
    return result.rows[0] || null;
  });
  if (!connectionRow) {
    await markFailed("Brak skonfigurowanego połączenia KSeF dla tej firmy klienta.");
    return;
  }
  // Deliberately not gated on connectionRow.status === "connected": that flag
  // only flips to "connected" after the next successful periodic ksef.sync
  // run (see app/api/workspace/ksef/connections/route.ts, which resets it to
  // "disconnected" on every reconnect). authenticate() below performs a full
  // fresh auth from token_ciphertext regardless of this cached status, and
  // handleKsefSync itself never checks it either — requiring it here would
  // just block sending for however long until the next sync tick happens to
  // land, with no error visible anywhere to explain why.

  try {
    const auth = await authenticate(connectionRow);
    await withTenant(tenantId, actorUserId, (client) =>
      client.query(
        `update ksef_connections set access_token_ciphertext = $1, access_token_expires_at = $2, refresh_token_ciphertext = $3, refresh_token_expires_at = $4, updated_at = now() where id = $5`,
        [
          encryptSecret(auth.accessToken, encryptionKey),
          auth.accessTokenExpiresAt,
          encryptSecret(auth.refreshToken, encryptionKey),
          auth.refreshTokenExpiresAt,
          connectionRow.id,
        ],
      ),
    );

    if (invoiceRow.status === "queued") {
      const session = await openOnlineSession(connectionRow.environment, auth.accessToken);
      const sent = await sendOnlineSessionInvoice(
        connectionRow.environment,
        auth.accessToken,
        session.referenceNumber,
        invoiceRow.invoice_xml,
        session.encryption,
      );
      await closeOnlineSession(connectionRow.environment, auth.accessToken, session.referenceNumber);
      console.log(
        `Invoice ${invoiceRow.invoice_number} (${invoiceId}) sent to KSeF: session=${session.referenceNumber} invoiceRef=${sent.referenceNumber}`,
      );

      await withTenant(tenantId, actorUserId, (client) =>
        client.query(
          `update issued_invoices set status = 'submitted', ksef_session_reference = $1, ksef_invoice_reference = $2, ksef_environment = $3, updated_at = now() where id = $4`,
          [session.referenceNumber, sent.referenceNumber, connectionRow.environment, invoiceId],
        ),
      );
      await invoiceQueue.add(
        "invoice.issue",
        { ...job.data, payload: { invoiceId, pollAttempts: 0 } },
        { delay: INVOICE_SUBMIT_FOLLOWUP_DELAY_MS },
      );
      return;
    }

    // status === "submitted": poll KSeF's asynchronous verification result.
    const statusResult = await getSessionInvoiceStatus(
      connectionRow.environment,
      auth.accessToken,
      invoiceRow.ksef_session_reference,
      invoiceRow.ksef_invoice_reference,
    );
    console.log(
      `Invoice ${invoiceRow.invoice_number} (${invoiceId}) KSeF status: code=${statusResult.code} description="${statusResult.description}"${statusResult.details.length ? ` details=${JSON.stringify(statusResult.details)}` : ""}`,
    );

    if (statusResult.code === 100 || statusResult.code === 150) {
      if (pollAttempts >= INVOICE_MAX_POLL_ATTEMPTS) {
        await markFailed("Przekroczono czas oczekiwania na potwierdzenie z KSeF.");
        return;
      }
      await invoiceQueue.add(
        "invoice.issue",
        { ...job.data, payload: { invoiceId, pollAttempts: pollAttempts + 1 } },
        { delay: INVOICE_POLL_DELAY_MS },
      );
      return;
    }

    if (statusResult.code === 200) {
      let upoStorageKey = null;
      if (statusResult.upoDownloadUrl) {
        try {
          const upoXml = await fetchSessionInvoiceUpo(statusResult.upoDownloadUrl);
          const stored = await saveInvoiceFile(tenantId, upoXml, invoiceRow.issued_at);
          upoStorageKey = stored.relativeKey;
        } catch (error) {
          console.warn(`Failed to fetch UPO for issued invoice ${invoiceId}`, error);
        }
      }

      await withTenant(tenantId, actorUserId, async (client) => {
        await client.query(
          `update issued_invoices set status = 'accepted', ksef_number = $1, upo_storage_key = $2, updated_at = now() where id = $3`,
          [statusResult.ksefNumber, upoStorageKey, invoiceId],
        );
        if (invoiceRow.document_id) {
          await client.query(
            "update documents set status = 'verified', ksef_number = $1, updated_at = now() where id = $2",
            [statusResult.ksefNumber, invoiceRow.document_id],
          );
        }
        await client.query(
          `insert into payments (tenant_id, client_company_id, document_id, tax_type, period_label, amount, currency, due_date, status, metadata)
           values ($1, $2, $3, 'invoice', $4, $5, $6, $7, 'due', $8::jsonb)`,
          [
            tenantId,
            invoiceRow.client_company_id,
            invoiceRow.document_id,
            periodLabel(invoiceRow.issued_at),
            invoiceRow.gross_total,
            invoiceRow.currency,
            invoiceRow.due_date || addDaysIso(invoiceRow.issued_at, 14),
            JSON.stringify({
              source: "issued_invoice",
              ksef_number: statusResult.ksefNumber,
              invoice_number: invoiceRow.invoice_number,
            }),
          ],
        );
        await client.query(
          "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'invoice.accepted', 'issued_invoice', $3, jsonb_build_object('ksef_number', $4::text))",
          [tenantId, actorUserId, invoiceId, statusResult.ksefNumber],
        );
      });
      return;
    }

    // Any other status code is a rejection (validation error, duplicate,
    // permissions, etc.) — see faktury/weryfikacja-faktury.md for the full
    // code table. Not auto-retried: KSeF gave a definitive answer.
    await withTenant(tenantId, actorUserId, async (client) => {
      const reason = statusResult.details.length ? statusResult.details.join("; ") : statusResult.description;
      const message = reason || `Błąd KSeF (${statusResult.code})`;
      await client.query(
        "update issued_invoices set status = 'rejected', error_message = $1, updated_at = now() where id = $2",
        [message.slice(0, 500), invoiceId],
      );
      if (invoiceRow.document_id) {
        await client.query("update documents set status = 'requires_action', updated_at = now() where id = $1", [
          invoiceRow.document_id,
        ]);
      }
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'invoice.rejected', 'issued_invoice', $3, jsonb_build_object('code', $4::int, 'description', $5::text, 'details', $6::jsonb))",
        [tenantId, actorUserId, invoiceId, statusResult.code, statusResult.description, JSON.stringify(statusResult.details)],
      );
    });
  } catch (error) {
    const message =
      error instanceof KsefApiError ? error.message : error instanceof Error ? error.message : "Nieznany błąd wysyłki faktury";
    // Marked failed on every attempt (mirroring handleKsefSync's convention)
    // so the UI reflects transient errors immediately; a later successful
    // retry overwrites this status. Note: if "send" itself succeeded on KSeF
    // but a later step in this same attempt threw, a retry will resubmit —
    // KSeF's own duplicate check (seller NIP + RodzajFaktury + P_2) rejects
    // that as code 440 rather than silently double-issuing, but the rejection
    // would then be misreported as a real failure. Accepted as a known MVP
    // gap; reconciling it would need tracking send-acknowledged-but-unclosed
    // state separately.
    await markFailed(message);
    throw error;
  }
}

async function processJob(job) {
  if (job.name === "ksef.sync") return handleKsefSync(job);
  if (job.name === "invoice.issue") return handleInvoiceIssue(job);
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
  await invoiceQueue.close();
  await connection.quit();
  await pool.end();
}

process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
