import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { canUseMessaging } from "@/lib/tenant-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ ticketId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const session = await getSession(request);
  if (!session?.tenantId || !canUseMessaging(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { ticketId } = await context.params;

  const data = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const ticketResult = await client.query<{ id: string; subject: string; status: string }>(
      "select id, subject, status from support_tickets where id = $1 and tenant_id = $2",
      [ticketId, session.tenantId],
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) return null;

    const messagesResult = await client.query<{
      id: string;
      sender_type: string;
      sender_name: string;
      body: string;
      created_at: string;
    }>(
      `select id, sender_type, sender_name, body, created_at
       from support_messages
       where ticket_id = $1
       order by created_at asc`,
      [ticketId],
    );

    await client.query("update support_tickets set client_last_read_at = now() where id = $1", [ticketId]);

    return { ticket, messages: messagesResult.rows };
  });

  if (!data) return NextResponse.json({ error: "Nie znaleziono zgłoszenia." }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session?.tenantId || !canUseMessaging(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { ticketId } = await context.params;

  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < 1 || message.length > 4000) {
    return NextResponse.json({ error: "Wiadomość musi mieć od 1 do 4000 znaków." }, { status: 400 });
  }

  const result = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const ticketResult = await client.query<{ id: string; status: string }>(
      "select id, status from support_tickets where id = $1 and tenant_id = $2",
      [ticketId, session.tenantId],
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) return "not_found" as const;
    if (ticket.status === "closed") return "closed" as const;

    await client.query(
      "insert into support_messages (ticket_id, tenant_id, sender_user_id, sender_type, sender_name, body) values ($1, $2, $3, 'client', $4, $5)",
      [ticketId, session.tenantId, session.userId, session.fullName, message],
    );
    await client.query(
      "update support_tickets set last_message_at = now(), last_message_by = 'client', client_last_read_at = now(), updated_at = now() where id = $1",
      [ticketId],
    );
    return "ok" as const;
  });

  if (result === "not_found") return NextResponse.json({ error: "Nie znaleziono zgłoszenia." }, { status: 404 });
  if (result === "closed") return NextResponse.json({ error: "To zgłoszenie zostało zamknięte. Wyślij nowe zgłoszenie, jeśli sprawa nadal wymaga uwagi." }, { status: 409 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
