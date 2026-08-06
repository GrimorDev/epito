import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  const allowed = session?.platformRole === "supervisor" || ["owner", "admin"].includes(session?.membershipRole || "");
  if (!session?.tenantId || !allowed) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  const legalName = typeof body?.legalName === "string" ? body.legalName.trim() : "";
  const nip = typeof body?.nip === "string" ? body.nip.replace(/\D/g, "") : "";
  if (displayName.length < 2 || displayName.length > 100 || legalName.length < 2 || legalName.length > 180 || (nip && nip.length !== 10)) {
    return NextResponse.json({ error: "Uzupełnij prawidłowe dane organizacji." }, { status: 400 });
  }

  try {
    await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      await client.query(
        "update tenants set display_name = $1, legal_name = $2, nip = $3, updated_at = now() where id = $4",
        [displayName, legalName, nip || null, session.tenantId],
      );
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'tenant.updated', 'tenant', $1, jsonb_build_object('display_name', $3::text, 'legal_name', $4::text, 'nip', $5::text))",
        [session.tenantId, session.userId, displayName, legalName, nip || null],
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "23505") return NextResponse.json({ error: "Organizacja z tym NIP już istnieje." }, { status: 409 });
    console.error("Tenant settings update failed", error);
    return NextResponse.json({ error: "Nie udało się zapisać ustawień." }, { status: 500 });
  }
}
