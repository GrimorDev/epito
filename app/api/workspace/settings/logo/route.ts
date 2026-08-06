import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const allowed = new Map([["image/png", ".png"], ["image/jpeg", ".jpg"], ["image/webp", ".webp"]]);

function uploadsRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.EPITO_UPLOADS_DIR?.trim() || "/app/data/uploads");
}

function safePath(key: string) {
  const root = uploadsRoot();
  const absolute = path.resolve(root, key);
  return absolute.startsWith(`${root}${path.sep}`) ? absolute : null;
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.tenantId) return NextResponse.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  const logo = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query<{ key: string | null; mime: string | null }>("select settings #>> '{branding,logoKey}' as key, settings #>> '{branding,logoMime}' as mime from tenants where id = $1", [session.tenantId]);
    return result.rows[0] || null;
  });
  if (!logo?.key || !logo.mime) return NextResponse.json({ error: "Logo nie zostało dodane." }, { status: 404 });
  const absolute = safePath(logo.key);
  if (!absolute) return NextResponse.json({ error: "Nieprawidłowa ścieżka logo." }, { status: 400 });
  try {
    const contents = await readFile(/* turbopackIgnore: true */ absolute);
    return new NextResponse(contents, { headers: { "Content-Type": logo.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Logo nie jest dostępne." }, { status: 404 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  const canEdit = session?.platformRole === "supervisor" || ["owner", "admin"].includes(session?.membershipRole || "");
  if (!session?.tenantId || !canEdit) return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("logo");
  if (!(file instanceof File) || !allowed.has(file.type) || file.size < 1 || file.size > MAX_LOGO_SIZE) {
    return NextResponse.json({ error: "Dodaj logo PNG, JPG lub WebP do 2 MB." }, { status: 400 });
  }
  const key = `${session.tenantId}/branding/${randomUUID()}${allowed.get(file.type)}`;
  const absolute = safePath(key);
  if (!absolute) return NextResponse.json({ error: "Nieprawidłowa ścieżka logo." }, { status: 400 });
  try {
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
    await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      await client.query(`update tenants set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{branding}', coalesce(settings->'branding', '{}'::jsonb) || $1::jsonb, true), updated_at = now() where id = $2`, [JSON.stringify({ logoKey: key, logoMime: file.type }), session.tenantId]);
      await client.query("insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'tenant.logo_updated', 'tenant', $1, jsonb_build_object('mime_type', $3::text, 'size', $4::bigint))", [session.tenantId, session.userId, file.type, file.size]);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Logo upload failed", error);
    return NextResponse.json({ error: "Nie udało się zapisać logo." }, { status: 500 });
  }
}
