import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canCreateClient = (role: string | null, platformRole: string) =>
  platformRole === "supervisor" || role === "owner" || role === "admin" || role === "accountant";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session?.tenantId || !canCreateClient(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const nip = typeof body?.nip === "string" ? body.nip.replace(/\D/g, "") : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  if (name.length < 2 || name.length > 180 || (nip && nip.length !== 10)) {
    return NextResponse.json({ error: "Uzupełnij prawidłową nazwę i NIP klienta." }, { status: 400 });
  }
  if (email.length > 254 || phone.length > 40) {
    return NextResponse.json({ error: "Dane kontaktowe są zbyt długie." }, { status: 400 });
  }

  try {
    const created = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      const result = await client.query<{ id: string }>(
        "insert into client_companies (tenant_id, name, nip, email, phone, status) values ($1, $2, $3, $4, $5, 'active') returning id",
        [session.tenantId, name, nip || null, email || null, phone || null],
      );
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'client.created', 'client_company', $3, jsonb_build_object('name', $4, 'nip', $5::text))",
        [session.tenantId, session.userId, result.rows[0].id, name, nip || null],
      );
      return result.rows[0];
    });
    return NextResponse.json({ ok: true, clientId: created.id }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "23505") {
      return NextResponse.json({ error: "Klient z tym NIP już istnieje." }, { status: 409 });
    }
    console.error("Client creation failed", error);
    return NextResponse.json({ error: "Nie udało się dodać klienta." }, { status: 500 });
  }
}
