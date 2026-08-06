import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ documentId: string }> };

function uploadsRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.EPITO_UPLOADS_DIR?.trim() || "/app/data/uploads");
}

function canEdit(role: string | null, platformRole: string) {
  return platformRole === "supervisor" || ["owner", "admin", "accountant", "employee"].includes(role || "");
}

export async function GET(request: NextRequest, context: Context) {
  const session = await getSession(request);
  if (!session?.tenantId) return NextResponse.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  const { documentId } = await context.params;
  const document = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query<{ name: string; storage_key: string; mime_type: string }>(
      "select name, storage_key, mime_type from documents where id = $1 and deleted_at is null",
      [documentId],
    );
    return result.rows[0] || null;
  });
  if (!document) return NextResponse.json({ error: "Nie znaleziono dokumentu." }, { status: 404 });

  const root = uploadsRoot();
  const absolutePath = path.resolve(root, document.storage_key);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) return NextResponse.json({ error: "Nieprawidłowa ścieżka dokumentu." }, { status: 400 });
  try {
    const contents = await readFile(/* turbopackIgnore: true */ absolutePath);
    const safeName = document.name.replace(/["\r\n]/g, "_");
    return new NextResponse(contents, { headers: { "Content-Type": document.mime_type, "Content-Length": String(contents.length), "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(document.name)}`, "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Plik nie jest dostępny w magazynie." }, { status: 404 });
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canEdit(session.membershipRole, session.platformRole)) return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  const { documentId } = await context.params;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 240) return NextResponse.json({ error: "Podaj prawidłową nazwę dokumentu." }, { status: 400 });

  const updated = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query("update documents set name = $1, updated_at = now(), version = version + 1 where id = $2 and deleted_at is null returning id", [name, documentId]);
    if (!result.rowCount) return false;
    await client.query("insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'document.renamed', 'document', $3, jsonb_build_object('name', $4::text))", [session.tenantId, session.userId, documentId, name]);
    return true;
  });
  if (!updated) return NextResponse.json({ error: "Nie znaleziono dokumentu." }, { status: 404 });
  return NextResponse.json({ ok: true });
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
