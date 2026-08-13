import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/database";
import { isPlatformStaff } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Any platform staff (helpdesk and up) sees every tenant's tickets here,
// without needing to impersonate each tenant first — see the
// support_tickets_staff_select RLS policy in 0010_support_messaging.sql.
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session || !isPlatformStaff(session.platformRole)) {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
  }

  const tickets = await withUserTransaction(session.userId, async (client) => {
    const result = await client.query<{
      id: string;
      tenant_id: string;
      tenant_name: string;
      subject: string;
      status: string;
      last_message_at: string;
      last_message_by: string;
      created_at: string;
      unread: boolean;
      last_message_preview: string | null;
    }>(
      `select t.id, t.tenant_id, tenant.display_name as tenant_name, t.subject, t.status,
        t.last_message_at, t.last_message_by, t.created_at,
        (t.last_message_by = 'client' and (t.staff_last_read_at is null or t.last_message_at > t.staff_last_read_at)) as unread,
        (select body from support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1) as last_message_preview
      from support_tickets t
      join tenants tenant on tenant.id = t.tenant_id
      order by t.last_message_at desc`,
    );
    return result.rows;
  });

  return NextResponse.json({ tickets });
}
