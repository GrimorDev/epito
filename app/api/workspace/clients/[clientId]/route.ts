import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ clientId: string }> };

const canManageClient = (role: string | null, platformRole: string) =>
  platformRole === "supervisor" || role === "owner" || role === "admin" || role === "accountant";

export async function PATCH(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canManageClient(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { clientId } = await context.params;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const nip = typeof body?.nip === "string" ? body.nip.replace(/\D/g, "") : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const statuses = new Set(["onboarding", "active", "suspended", "archived"]);
  const status = typeof body?.status === "string" && statuses.has(body.status) ? body.status : "active";
  if (name.length < 2 || name.length > 180 || (nip && nip.length !== 10)) {
    return NextResponse.json({ error: "Uzupełnij prawidłową nazwę i NIP klienta." }, { status: 400 });
  }
  if (email.length > 254 || phone.length > 40) {
    return NextResponse.json({ error: "Dane kontaktowe są zbyt długie." }, { status: 400 });
  }

  try {
    const updated = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      const result = await client.query(
        `update client_companies set name = $1, nip = $2, email = $3, phone = $4, status = $5, updated_at = now()
         where id = $6 and deleted_at is null returning id`,
        [name, nip || null, email || null, phone || null, status, clientId],
      );
      if (!result.rowCount) return false;
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'client.updated', 'client_company', $3, jsonb_build_object('name', $4::text, 'nip', $5::text, 'status', $6::text))",
        [session.tenantId, session.userId, clientId, name, nip || null, status],
      );
      return true;
    });
    if (!updated) return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "23505") return NextResponse.json({ error: "Klient z tym NIP już istnieje." }, { status: 409 });
    console.error("Client update failed", error);
    return NextResponse.json({ error: "Nie udało się zapisać zmian." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canManageClient(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { clientId } = await context.params;

  const deleted = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query(
      "update client_companies set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null returning id",
      [clientId],
    );
    if (!result.rowCount) return false;
    await client.query(
      "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id) values ($1, $2, 'client.deleted', 'client_company', $3)",
      [session.tenantId, session.userId, clientId],
    );
    return true;
  });
  if (!deleted) return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
