import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { encryptSecret } from "@/lib/server/crypto-secrets";
import type { KsefEnvironment } from "@/lib/server/ksef/client";
import { scheduleKsefSync, unscheduleKsefSync } from "@/lib/server/queues";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENVIRONMENTS = new Set<KsefEnvironment>(["test", "demo", "production"]);

function canManageConnections(role: string | null, platformRole: string) {
  return platformRole === "supervisor" || role === "owner" || role === "admin";
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.tenantId) return NextResponse.json({ error: "Zaloguj się ponownie." }, { status: 401 });

  const connections = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query(`
      select connection.id, connection.client_company_id, company.name as client_company_name,
        connection.environment, connection.nip, connection.status, connection.last_synced_at, connection.last_error,
        connection.created_at
      from ksef_connections connection
      join client_companies company on company.id = connection.client_company_id
      where company.deleted_at is null
      order by company.name
    `);
    return result.rows;
  });

  return NextResponse.json({ connections });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session?.tenantId || !canManageConnections(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const clientCompanyId = typeof body?.clientCompanyId === "string" ? body.clientCompanyId : "";
  const environment = typeof body?.environment === "string" ? body.environment : "test";
  const nip = typeof body?.nip === "string" ? body.nip.replace(/\D/g, "") : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!clientCompanyId) {
    return NextResponse.json({ error: "Wybierz firmę klienta." }, { status: 400 });
  }
  if (!ENVIRONMENTS.has(environment as KsefEnvironment)) {
    return NextResponse.json({ error: "Nieprawidłowe środowisko KSeF." }, { status: 400 });
  }
  if (nip.length !== 10) {
    return NextResponse.json({ error: "Podaj prawidłowy 10-cyfrowy NIP." }, { status: 400 });
  }
  if (token.length < 10 || token.length > 512) {
    return NextResponse.json({ error: "Podaj prawidłowy token KSeF." }, { status: 400 });
  }

  try {
    const tokenCiphertext = await encryptSecret(token);
    const connectionId = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      const company = await client.query(
        "select id from client_companies where id = $1 and deleted_at is null",
        [clientCompanyId],
      );
      if (!company.rowCount) throw new Error("CLIENT_NOT_FOUND");

      const result = await client.query<{ id: string }>(
        `insert into ksef_connections (tenant_id, client_company_id, environment, nip, token_ciphertext, status, created_by)
         values ($1, $2, $3, $4, $5, 'disconnected', $6)
         on conflict (tenant_id, client_company_id) do update set
           environment = excluded.environment,
           nip = excluded.nip,
           token_ciphertext = excluded.token_ciphertext,
           status = 'disconnected',
           last_error = null,
           updated_at = now()
         returning id`,
        [session.tenantId, clientCompanyId, environment, nip, tokenCiphertext, session.userId],
      );
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'ksef_connection.saved', 'ksef_connection', $3, jsonb_build_object('client_company_id', $4::text, 'environment', $5::text))",
        [session.tenantId, session.userId, result.rows[0].id, clientCompanyId, environment],
      );
      return result.rows[0].id;
    });
    try {
      await scheduleKsefSync(connectionId, session.tenantId, session.userId);
    } catch (error) {
      console.error("KSeF poll scheduling failed", error);
    }
    return NextResponse.json({ ok: true, connectionId }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CLIENT_NOT_FOUND") {
      return NextResponse.json({ error: "Nie znaleziono firmy klienta." }, { status: 404 });
    }
    console.error("KSeF connection save failed", error);
    return NextResponse.json({ error: "Nie udało się zapisać połączenia KSeF." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session?.tenantId || !canManageConnections(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const connectionId = request.nextUrl.searchParams.get("connectionId") || "";
  if (!connectionId) return NextResponse.json({ error: "Podaj identyfikator połączenia." }, { status: 400 });

  const removed = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query("delete from ksef_connections where id = $1 returning id", [connectionId]);
    if (!result.rowCount) return false;
    await client.query(
      "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id) values ($1, $2, 'ksef_connection.deleted', 'ksef_connection', $3)",
      [session.tenantId, session.userId, connectionId],
    );
    return true;
  });
  if (!removed) return NextResponse.json({ error: "Nie znaleziono połączenia." }, { status: 404 });
  try {
    await unscheduleKsefSync(connectionId);
  } catch (error) {
    console.error("KSeF poll unscheduling failed", error);
  }
  return NextResponse.json({ ok: true });
}
