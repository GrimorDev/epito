import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { Worker } from "bullmq";
import Redis from "ioredis";
import pg from "pg";
import { PDFParse } from "pdf-parse";
import { extractInvoiceData, hasUsefulPdfText } from "./lib/invoice-extraction.mjs";

const require = createRequire(import.meta.url);
const { createWorker, OEM } = require("tesseract.js");
const polishLanguage = require("@tesseract.js-data/pol");
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
const uploadsRoot = path.resolve(process.env.EPITO_UPLOADS_DIR?.trim() || "/app/data/uploads");
const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 5432),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: databasePassword,
  ssl: process.env.DATABASE_SSL === "require",
  application_name: "epito-document-worker",
  max: 2,
});
const connection = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT || 6379),
  password: redisPassword,
  maxRetriesPerRequest: null,
  connectionName: "epito-document-worker",
});

let ocrWorkerPromise;
async function getOcrWorker() {
  ocrWorkerPromise ??= createWorker(polishLanguage.code, OEM.LSTM_ONLY, {
    langPath: polishLanguage.langPath,
    gzip: polishLanguage.gzip,
    cacheMethod: "none",
  });
  return ocrWorkerPromise;
}

async function analyzePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText({ first: 3 });
    if (hasUsefulPdfText(textResult.text) && extractInvoiceData(textResult.text).amount !== null) {
      return { text: textResult.text, pages: textResult.total, method: "pdf_text", ocrConfidence: null };
    }
    const screenshots = await parser.getScreenshot({ first: Math.min(2, textResult.total || 1), desiredWidth: 1900, imageDataUrl: false, imageBuffer: true });
    const worker = await getOcrWorker();
    const recognized = [];
    const confidences = [];
    for (const page of screenshots.pages) {
      const result = await worker.recognize(Buffer.from(page.data));
      recognized.push(result.data.text);
      confidences.push(Number(result.data.confidence || 0) / 100);
    }
    return {
      text: recognized.join("\n"),
      pages: textResult.total,
      method: "ocr",
      ocrConfidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0,
    };
  } finally {
    await parser.destroy();
  }
}

async function analyzeImage(buffer) {
  const worker = await getOcrWorker();
  const result = await worker.recognize(buffer);
  return { text: result.data.text, pages: 1, method: "ocr", ocrConfidence: Number(result.data.confidence || 0) / 100 };
}

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

async function analyzeDocument(job) {
  if (job.data.type !== "document.analyze") return;
  const documentId = String(job.data.payload?.documentId || "");
  if (!documentId) throw new Error("Missing documentId");
  const document = await withTenant(job.data.tenantId, job.data.actorUserId, async (client) => {
    const result = await client.query("update documents set status = 'processing', updated_at = now() where id = $1 and deleted_at is null returning id, storage_key, mime_type", [documentId]);
    return result.rows[0] || null;
  });
  if (!document) return;

  try {
    const absolutePath = path.resolve(uploadsRoot, document.storage_key);
    if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) throw new Error("Invalid document path");
    const buffer = await readFile(absolutePath);
    let source;
    if (document.mime_type === "application/pdf") source = await analyzePdf(buffer);
    else if (document.mime_type === "image/jpeg" || document.mime_type === "image/png") source = await analyzeImage(buffer);
    else source = { text: buffer.toString("utf8"), pages: 1, method: "pdf_text", ocrConfidence: null };
    const extracted = extractInvoiceData(source.text, source);
    const status = extracted.amount === null ? "requires_action" : "verified";
    const analysis = {
      state: status === "verified" ? "completed" : "needs_review",
      method: extracted.method,
      confidence: extracted.confidence,
      amount_source: extracted.amountLabel,
      page_count: source.pages,
      analyzed_at: new Date().toISOString(),
      extracted: {
        amount: extracted.amount,
        currency: extracted.currency,
        invoice_number: extracted.invoiceNumber,
        issued_at: extracted.issuedAt,
        nips: extracted.nips,
      },
      text_excerpt: extracted.textExcerpt,
      reason: extracted.amount === null ? "Nie znaleziono jednoznacznie oznaczonej kwoty do zapłaty. Uzupełnij ją ręcznie." : null,
    };
    await withTenant(job.data.tenantId, job.data.actorUserId, async (client) => {
      await client.query(`
        update documents set status = $1, amount = $2, currency = $3, issued_at = $4,
          structured_data = jsonb_set(coalesce(structured_data, '{}'::jsonb), '{analysis}', $5::jsonb, true),
          updated_at = now(), version = version + 1
        where id = $6 and deleted_at is null
      `, [status, extracted.amount, extracted.currency, extracted.issuedAt, JSON.stringify(analysis), documentId]);
      await client.query("insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'document.analyzed', 'document', $3, $4::jsonb)", [job.data.tenantId, job.data.actorUserId, documentId, JSON.stringify({ status, method: extracted.method, confidence: extracted.confidence })]);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown processing error";
    await withTenant(job.data.tenantId, job.data.actorUserId, async (client) => {
      await client.query(`update documents set status = 'requires_action', structured_data = jsonb_set(coalesce(structured_data, '{}'::jsonb), '{analysis}', $1::jsonb, true), updated_at = now() where id = $2`, [JSON.stringify({ state: "failed", reason: message, analyzed_at: new Date().toISOString() }), documentId]);
    });
    throw error;
  }
}

const worker = new Worker("documents", analyzeDocument, {
  connection,
  prefix: "epito",
  concurrency: 1,
  lockDuration: 180_000,
});

worker.on("completed", (job) => console.log(`Document job ${job.id} completed`));
worker.on("failed", (job, error) => console.error(`Document job ${job?.id || "unknown"} failed`, error));

async function shutdown() {
  await worker.close();
  if (ocrWorkerPromise) await (await ocrWorkerPromise).terminate();
  await connection.quit();
  await pool.end();
}

process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
