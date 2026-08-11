import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { enqueueBackgroundJob } from "@/lib/server/queues";
import { parseInvoiceDetails } from "@/lib/server/ksef/client";
import { escapeHtml, renderInvoiceHtml } from "@/lib/server/invoice-html";
import { renderHtmlToPdf } from "@/lib/server/pdf";
import { canEditTenantData } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ documentId: string }> };

function uploadsRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.EPITO_UPLOADS_DIR?.trim() || "/app/data/uploads");
}

function canEdit(role: string | null, platformRole: string) {
  return canEditTenantData(platformRole) || ["owner", "admin", "accountant", "employee"].includes(role || "");
}

export async function GET(request: NextRequest, context: Context) {
  const session = await getSession(request);
  if (!session?.tenantId) return NextResponse.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  const { documentId } = await context.params;
  const document = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query<{
      name: string;
      storage_key: string;
      mime_type: string;
      ksef_number: string | null;
      payment_reference: string | null;
    }>(
      `select document.name, document.storage_key, document.mime_type, document.ksef_number, payment.payment_reference
       from documents document
       left join payments payment on payment.document_id = document.id and payment.metadata->>'source' = 'issued_invoice'
       where document.id = $1 and document.deleted_at is null`,
      [documentId],
    );
    return result.rows[0] || null;
  });
  if (!document) return NextResponse.json({ error: "Nie znaleziono dokumentu." }, { status: 404 });

  const root = uploadsRoot();
  const absolutePath = path.resolve(root, document.storage_key);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) return NextResponse.json({ error: "Nieprawidłowa ścieżka dokumentu." }, { status: 400 });
  try {
    const rawContents = await readFile(/* turbopackIgnore: true */ absolutePath);
    const safeName = document.name.replace(/["\r\n]/g, "_");
    const isXml = document.mime_type.includes("xml");
    const wantsPdf = request.nextUrl.searchParams.get("format") === "pdf";
    const disposition = request.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment";

    if (isXml && (disposition === "inline" || wantsPdf)) {
      let html: string;
      try {
        html = renderInvoiceHtml(parseInvoiceDetails(rawContents.toString("utf8")), document.ksef_number, document.payment_reference);
      } catch {
        html = `<!doctype html><meta charset="utf-8"><pre style="white-space:pre-wrap;font-family:monospace;">${escapeHtml(rawContents.toString("utf8"))}</pre>`;
      }

      if (wantsPdf) {
        const pdf = await renderHtmlToPdf(html);
        return new NextResponse(pdf as BodyInit, { headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(pdf.length),
          "Content-Disposition": `attachment; filename="${safeName.replace(/\.xml$/i, "")}.pdf"`,
          "Cache-Control": "private, no-store",
        } });
      }

      return new NextResponse(html, { headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      } });
    }

    return new NextResponse(rawContents, { headers: {
      "Content-Type": document.mime_type,
      "Content-Length": String(rawContents.length),
      "Content-Disposition": `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(document.name)}`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return NextResponse.json({ error: "Plik nie jest dostępny w magazynie." }, { status: 404 });
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canEdit(session.membershipRole, session.platformRole)) return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  const { documentId } = await context.params;
  const body = (await request.json().catch(() => null)) as { name?: unknown; category?: unknown; status?: unknown; amount?: unknown; currency?: unknown; issuedAt?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 240) return NextResponse.json({ error: "Podaj prawidłową nazwę dokumentu." }, { status: 400 });
  const categories = new Set(["sales", "costs", "bank", "contracts", "tax", "other"]);
  const statuses = new Set(["verified", "requires_action"]);
  const category = typeof body?.category === "string" && categories.has(body.category) ? body.category : "other";
  const status = typeof body?.status === "string" && statuses.has(body.status) ? body.status : "verified";
  const currency = typeof body?.currency === "string" && /^[A-Z]{3}$/.test(body.currency) ? body.currency : "PLN";
  const amountValue = body?.amount === "" || body?.amount === null || body?.amount === undefined ? null : Number(String(body.amount).replace(",", "."));
  if (amountValue !== null && (!Number.isFinite(amountValue) || amountValue < 0 || amountValue >= 1_000_000_000)) {
    return NextResponse.json({ error: "Podaj prawidłową kwotę dokumentu." }, { status: 400 });
  }
  const issuedAt = typeof body?.issuedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.issuedAt) ? body.issuedAt : null;

  const updated = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query(`
      update documents set name = $1, category = $2, status = $3, amount = $4, currency = $5, issued_at = $6,
        structured_data = jsonb_set(coalesce(structured_data, '{}'::jsonb), '{manual_override}', $7::jsonb, true),
        updated_at = now(), version = version + 1
      where id = $8 and deleted_at is null returning id
    `, [name, category, status, amountValue, currency, issuedAt, JSON.stringify({ amount: amountValue, currency, issued_at: issuedAt, corrected_at: new Date().toISOString(), corrected_by: session.userId }), documentId]);
    if (!result.rowCount) return false;
    await client.query("insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'document.updated', 'document', $3, $4::jsonb)", [session.tenantId, session.userId, documentId, JSON.stringify({ name, category, status, amount: amountValue, currency, issued_at: issuedAt })]);
    return true;
  });
  if (!updated) return NextResponse.json({ error: "Nie znaleziono dokumentu." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canEdit(session.membershipRole, session.platformRole)) return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  const { documentId } = await context.params;

  const queued = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query(`
      update documents
      set status = 'uploaded', amount = null, issued_at = null,
          structured_data = jsonb_set(coalesce(structured_data, '{}'::jsonb) - 'manual_override', '{analysis}', $1::jsonb, true),
          updated_at = now(), version = version + 1
      where id = $2 and deleted_at is null
      returning id
    `, [JSON.stringify({ state: "queued", requested_at: new Date().toISOString() }), documentId]);
    if (!result.rowCount) return false;
    await client.query(
      "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id) values ($1, $2, 'document.analysis_requested', 'document', $3)",
      [session.tenantId, session.userId, documentId],
    );
    return true;
  });
  if (!queued) return NextResponse.json({ error: "Nie znaleziono dokumentu." }, { status: 404 });

  try {
    await enqueueBackgroundJob("documents", {
      tenantId: session.tenantId,
      actorUserId: session.userId,
      type: "document.analyze",
      payload: { documentId },
      createdAt: new Date().toISOString(),
    }, { jobId: `document-reanalyze-${documentId}-${Date.now()}` });
  } catch (error) {
    console.error("Document reanalysis enqueue failed", error);
    await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      await client.query(`
        update documents
        set status = 'requires_action',
            structured_data = jsonb_set(coalesce(structured_data, '{}'::jsonb), '{analysis}', $1::jsonb, true),
            updated_at = now()
        where id = $2 and deleted_at is null
      `, [JSON.stringify({ state: "failed", reason: "Nie udało się uruchomić analizy. Spróbuj ponownie.", analyzed_at: new Date().toISOString() }), documentId]);
    });
    return NextResponse.json({ error: "Nie udało się dodać dokumentu do kolejki analizy." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, analysis: "queued" }, { status: 202 });
}

export async function DELETE(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canEdit(session.membershipRole, session.platformRole)) return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  const { documentId } = await context.params;
  const removed = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query("update documents set deleted_at = now(), updated_at = now(), version = version + 1 where id = $1 and deleted_at is null returning id", [documentId]);
    if (!result.rowCount) return false;
    await client.query("insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id) values ($1, $2, 'document.deleted', 'document', $3)", [session.tenantId, session.userId, documentId]);
    return true;
  });
  if (!removed) return NextResponse.json({ error: "Nie znaleziono dokumentu." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
