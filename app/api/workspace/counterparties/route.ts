import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function canManage(role: string | null, platformRole: string) {
  return platformRole === "supervisor" || ["owner", "admin", "accountant", "employee"].includes(role || "");
}

const NIP_PATTERN = /^\d{10}$/;

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.tenantId) return NextResponse.json({ error: "Brak sesji." }, { status: 401 });

  const clientCompanyId = request.nextUrl.searchParams.get("clientCompanyId");
  if (!clientCompanyId) return NextResponse.json({ error: "Wskaż firmę klienta." }, { status: 400 });

  const counterparties = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query(
      "select id, name, nip, address, email from counterparties where client_company_id = $1 and deleted_at is null order by name asc",
      [clientCompanyId],
    );
    return result.rows;
  });

  return NextResponse.json({ counterparties });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canManage(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const clientCompanyId = typeof body?.clientCompanyId === "string" ? body.clientCompanyId : null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const nip = typeof body?.nip === "string" ? body.nip.trim() : "";
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!clientCompanyId) return NextResponse.json({ error: "Wskaż firmę klienta." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Podaj nazwę kontrahenta." }, { status: 400 });
  if (nip && !NIP_PATTERN.test(nip)) {
    return NextResponse.json({ error: "NIP kontrahenta musi składać się z 10 cyfr." }, { status: 400 });
  }

  const company = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query<{ id: string }>(
      "select id from client_companies where id = $1 and deleted_at is null",
      [clientCompanyId],
    );
    return result.rows[0] || null;
  });
  if (!company) return NextResponse.json({ error: "Nie znaleziono firmy klienta." }, { status: 404 });

  const counterparty = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const inserted = await client.query(
      `insert into counterparties (tenant_id, client_company_id, name, nip, address, email)
       values ($1, $2, $3, $4, $5, $6)
       returning id, name, nip, address, email`,
      [session.tenantId, clientCompanyId, name, nip || null, address || null, email || null],
    );
    await client.query(
      "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'counterparty.created', 'counterparty', $3, jsonb_build_object('name', $4::text))",
      [session.tenantId, session.userId, inserted.rows[0].id, name],
    );
    return inserted.rows[0];
  });

  return NextResponse.json({ ok: true, counterparty }, { status: 201 });
}
