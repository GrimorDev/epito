import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/database";
import { isPlatformStaff } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ ticketId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const session = await getSession(request);
  if (!session || !isPlatformStaff(session.platformRole)) {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
  }
  const { ticketId } = await context.params;

  const data = await withUserTransaction(session.userId, async (client) => {
    const ticketResult = await client.query<{ id: string; tenant_id: string; tenant_name: string; subject: string; status: string }>(
      `select t.id, t.tenant_id, tenant.display_name as tenant_name, t.subject, t.status
       from support_tickets t
       join tenants tenant on tenant.id = t.tenant_id
       where t.id = $1`,
      [ticketId],
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
      `select message.id, message.sender_type, user_row.full_name as sender_name, message.body, message.created_at
       from support_messages message
       join users user_row on user_row.id = message.sender_user_id
       where message.ticket_id = $1
       order by message.created_at asc`,
      [ticketId],
    );

    await client.query("update support_tickets set staff_last_read_at = now() where id = $1", [ticketId]);

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
  if (!session || !isPlatformStaff(session.platformRole)) {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
  }
  const { ticketId } = await context.params;

  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < 1 || message.length > 4000) {
    return NextResponse.json({ error: "Wiadomość musi mieć od 1 do 4000 znaków." }, { status: 400 });
  }

  const updated = await withUserTransaction(session.userId, async (client) => {
    const ticketResult = await client.query<{ id: string; tenant_id: string }>(
      "select id, tenant_id from support_tickets where id = $1",
      [ticketId],
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) return false;

    await client.query(
      "insert into support_messages (ticket_id, tenant_id, sender_user_id, sender_type, body) values ($1, $2, $3, 'staff', $4)",
      [ticketId, ticket.tenant_id, session.userId, message],
    );
    await client.query(
      "update support_tickets set last_message_at = now(), last_message_by = 'staff', staff_last_read_at = now(), updated_at = now() where id = $1",
      [ticketId],
    );
    return true;
  });

  if (!updated) return NextResponse.json({ error: "Nie znaleziono zgłoszenia." }, { status: 404 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
