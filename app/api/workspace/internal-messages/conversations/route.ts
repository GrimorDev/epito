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

  const conversations = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query<{
      id: string;
      other_user_id: string;
      other_user_name: string;
      last_message_at: string;
      unread: boolean;
      last_message_preview: string | null;
    }>(
      `select c.id,
        (case when c.user_a_id = $2 then c.user_b_id else c.user_a_id end) as other_user_id,
        other_user.full_name as other_user_name,
        c.last_message_at,
        (
          (select m.sender_user_id from internal_messages m where m.conversation_id = c.id order by m.created_at desc limit 1) <> $2
          and (
            (case when c.user_a_id = $2 then c.user_a_last_read_at else c.user_b_last_read_at end) is null
            or c.last_message_at > (case when c.user_a_id = $2 then c.user_a_last_read_at else c.user_b_last_read_at end)
          )
        ) as unread,
        (select body from internal_messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_message_preview
      from internal_conversations c
      join users other_user on other_user.id = (case when c.user_a_id = $2 then c.user_b_id else c.user_a_id end)
      where c.tenant_id = $1 and (c.user_a_id = $2 or c.user_b_id = $2)
      order by c.last_message_at desc`,
      [session.tenantId, session.userId],
    );
    return result.rows;
  });

  return NextResponse.json({ conversations });
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
  const targetUserId = typeof body?.userId === "string" ? body.userId : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!targetUserId || targetUserId === session.userId) {
    return NextResponse.json({ error: "Wybierz osobę, do której chcesz napisać." }, { status: 400 });
  }
  if (message.length < 1 || message.length > 4000) {
    return NextResponse.json({ error: "Wiadomość musi mieć od 1 do 4000 znaków." }, { status: 400 });
  }

  const result = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const contactResult = await client.query(
      `select 1 from tenant_memberships membership
       join users user_row on user_row.id = membership.user_id
       where membership.tenant_id = $1 and membership.user_id = $2
         and membership.role in ('owner', 'admin', 'accountant', 'employee')
         and membership.status = 'active' and user_row.deleted_at is null`,
      [session.tenantId, targetUserId],
    );
    if (!contactResult.rowCount) return { error: "Nie znaleziono osoby." } as const;

    const [userAId, userBId] = [session.userId, targetUserId].sort();
    const conversationResult = await client.query<{ id: string }>(
      `insert into internal_conversations (tenant_id, user_a_id, user_b_id)
       values ($1, $2, $3)
       on conflict (tenant_id, user_a_id, user_b_id) do update set tenant_id = excluded.tenant_id
       returning id`,
      [session.tenantId, userAId, userBId],
    );
    const conversationId = conversationResult.rows[0].id;

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
    return { conversationId } as const;
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, conversationId: result.conversationId }, { status: 201 });
}
