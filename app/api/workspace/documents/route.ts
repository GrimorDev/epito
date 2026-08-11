import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { enqueueBackgroundJob } from "@/lib/server/queues";
import { canEditTenantData } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/csv",
  "text/xml",
  "application/xml",
]);

function uploadsRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.EPITO_UPLOADS_DIR?.trim() || "/app/data/uploads");
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  const allowed = canEditTenantData(session?.platformRole) || ["owner", "admin", "accountant", "employee"].includes(session?.membershipRole || "");
  if (!session?.tenantId || !allowed) return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const requestedCompanyId = form?.get("clientCompanyId");
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_SIZE || !allowedMimeTypes.has(file.type)) {
    return NextResponse.json({ error: "Dodaj plik PDF, JPG, PNG, CSV lub XML o wielkości do 15 MB." }, { status: 400 });
  }

  const originalName = file.name.trim().slice(0, 240) || "Dokument";
  const extension = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const now = new Date();
  const relativeKey = `${session.tenantId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}${extension}`;
  const root = uploadsRoot();
  const absolutePath = path.resolve(root, relativeKey);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) return NextResponse.json({ error: "Nieprawidłowa ścieżka pliku." }, { status: 400 });

  let fileWritten = false;
  try {
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes, { flag: "wx" });
    fileWritten = true;

    const documentId = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      let company: { rows: { id: string }[]; rowCount: number | null };
      if (typeof requestedCompanyId === "string" && requestedCompanyId) {
        company = await client.query<{ id: string }>(
          "select id from client_companies where id = $1 and deleted_at is null",
          [requestedCompanyId],
        );
        if (!company.rowCount) throw new Error("CLIENT_NOT_FOUND");
      } else {
        company = await client.query<{ id: string }>("select id from client_companies where deleted_at is null order by created_at limit 1");
        if (!company.rowCount) {
          company = await client.query<{ id: string }>(`
            insert into client_companies (tenant_id, name, nip, email, status, metadata)
            select id, legal_name, nip, $2, 'active', '{"primary":true}'::jsonb from tenants where id = $1
            returning id
          `, [session.tenantId, session.email]);
        }
      }
      const created = await client.query<{ id: string }>(`
        insert into documents (
          tenant_id, client_company_id, created_by, name, category, source, status,
          storage_key, mime_type, file_size, checksum_sha256, document_year, document_month
        ) values ($1, $2, $3, $4, 'other', 'upload', 'uploaded', $5, $6, $7, $8, $9, $10)
        returning id
      `, [session.tenantId, company.rows[0].id, session.userId, originalName, relativeKey, file.type, file.size, checksum, now.getUTCFullYear(), now.getUTCMonth() + 1]);
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'document.uploaded', 'document', $3, jsonb_build_object('name', $4::text, 'size', $5::bigint))",
        [session.tenantId, session.userId, created.rows[0].id, originalName, file.size],
      );
      return created.rows[0].id;
    });
    try {
      await enqueueBackgroundJob("documents", {
        tenantId: session.tenantId,
        actorUserId: session.userId,
        type: "document.analyze",
        payload: { documentId },
        createdAt: new Date().toISOString(),
      }, { jobId: `document-analyze-${documentId}` });
    } catch (queueError) {
      console.error("Document analysis enqueue failed", queueError);
      await withTenantTransaction(session.tenantId, session.userId, async (client) => {
        await client.query(`
          update documents
          set status = 'requires_action',
              structured_data = jsonb_set(coalesce(structured_data, '{}'::jsonb), '{analysis}', $1::jsonb, true),
              updated_at = now()
          where id = $2
        `, [JSON.stringify({ state: "failed", reason: "Nie udało się uruchomić automatycznej analizy. Dane można uzupełnić ręcznie.", analyzed_at: new Date().toISOString() }), documentId]);
      });
    }
    return NextResponse.json({ ok: true, documentId, analysis: "queued" }, { status: 201 });
  } catch (error) {
    if (fileWritten) await rm(absolutePath, { force: true }).catch(() => undefined);
    if (error instanceof Error && error.message === "CLIENT_NOT_FOUND") {
      return NextResponse.json({ error: "Nie znaleziono firmy klienta." }, { status: 404 });
    }
    console.error("Document upload failed", error);
    return NextResponse.json({ error: "Nie udało się zapisać dokumentu." }, { status: 500 });
  }
}
