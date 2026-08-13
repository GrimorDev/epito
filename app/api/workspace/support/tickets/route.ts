import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { canUseMessaging } from "@/lib/tenant-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.tenantId || !canUseMessaging(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const tickets = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query<{
      id: string;
      subject: string;
      status: string;
      last_message_at: string;
      last_message_by: string;
      created_at: string;
      unread: boolean;
      last_message_preview: string | null;
    }>(
      `select t.id, t.subject, t.status, t.last_message_at, t.last_message_by, t.created_at,
        (t.last_message_by = 'staff' and t.last_message_at > t.client_last_read_at) as unread,
        (select body from support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1) as last_message_preview
      from support_tickets t
      where t.tenant_id = $1
      order by t.last_message_at desc`,
      [session.tenantId],
    );
    return result.rows;
  });

  return NextResponse.json({ tickets });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session?.tenantId || !canUseMessaging(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (subject.length < 2 || subject.length > 200) {
    return NextResponse.json({ error: "Podaj temat zgłoszenia (2-200 znaków)." }, { status: 400 });
  }
  if (message.length < 1 || message.length > 4000) {
    return NextResponse.json({ error: "Wiadomość musi mieć od 1 do 4000 znaków." }, { status: 400 });
  }

  const ticket = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const created = await client.query<{ id: string }>(
      "insert into support_tickets (tenant_id, subject, created_by) values ($1, $2, $3) returning id",
      [session.tenantId, subject, session.userId],
    );
    const ticketId = created.rows[0].id;
    await client.query(
      "insert into support_messages (ticket_id, tenant_id, sender_user_id, sender_type, body) values ($1, $2, $3, 'client', $4)",
      [ticketId, session.tenantId, session.userId, message],
    );
    return { id: ticketId };
  });

  return NextResponse.json({ ok: true, ticketId: ticket.id }, { status: 201 });
}
