import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { canUseMessaging } from "@/lib/tenant-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ conversationId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const session = await getSession(request);
  if (!session?.tenantId || !canUseMessaging(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { conversationId } = await context.params;

  const data = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const conversationResult = await client.query<{ id: string; other_user_id: string; other_user_name: string }>(
      `select c.id,
        (case when c.user_a_id = $2 then c.user_b_id else c.user_a_id end) as other_user_id,
        other_user.full_name as other_user_name
       from internal_conversations c
       join users other_user on other_user.id = (case when c.user_a_id = $2 then c.user_b_id else c.user_a_id end)
       where c.id = $1 and c.tenant_id = $3 and (c.user_a_id = $2 or c.user_b_id = $2)`,
      [conversationId, session.userId, session.tenantId],
    );
    const conversation = conversationResult.rows[0];
    if (!conversation) return null;

    const messagesResult = await client.query<{ id: string; sender_user_id: string; sender_name: string; body: string; created_at: string }>(
      "select id, sender_user_id, sender_name, body, created_at from internal_messages where conversation_id = $1 order by created_at asc",
      [conversationId],
    );

    await client.query(
      `update internal_conversations set
        user_a_last_read_at = case when user_a_id = $2 then now() else user_a_last_read_at end,
        user_b_last_read_at = case when user_b_id = $2 then now() else user_b_last_read_at end
       where id = $1`,
      [conversationId, session.userId],
    );

    return { conversation, messages: messagesResult.rows };
  });

  if (!data) return NextResponse.json({ error: "Nie znaleziono rozmowy." }, { status: 404 });
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
  const { conversationId } = await context.params;

  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < 1 || message.length > 4000) {
    return NextResponse.json({ error: "Wiadomość musi mieć od 1 do 4000 znaków." }, { status: 400 });
  }

  const updated = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const conversationResult = await client.query(
      "select id from internal_conversations where id = $1 and tenant_id = $2 and (user_a_id = $3 or user_b_id = $3)",
      [conversationId, session.tenantId, session.userId],
    );
    if (!conversationResult.rowCount) return false;

    await client.query(
      "insert into internal_messages (conversation_id, tenant_id, sender_user_id, sender_name, body) values ($1, $2, $3, $4, $5)",
      [conversationId, session.tenantId, session.userId, session.fullName, message],
    );
    await client.query(
      `update internal_conversations set last_message_at = now(),
        user_a_last_read_at = case when user_a_id = $2 then now() else user_a_last_read_at end,
        user_b_last_read_at = case when user_b_id = $2 then now() else user_b_last_read_at end
       where id = $1`,
      [conversationId, session.userId],
    );
    return true;
  });

  if (!updated) return NextResponse.json({ error: "Nie znaleziono rozmowy." }, { status: 404 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
