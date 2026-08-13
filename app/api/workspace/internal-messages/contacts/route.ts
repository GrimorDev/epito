import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { canUseMessaging } from "@/lib/tenant-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Eligible chat partners: same roles that can use messaging at all
// (owner/admin/accountant/employee — viewer excluded), any active member
// of the tenant other than yourself.
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.tenantId || !canUseMessaging(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const contacts = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query<{ id: string; full_name: string; role: string }>(
      `select user_row.id, user_row.full_name, membership.role
       from tenant_memberships membership
       join users user_row on user_row.id = membership.user_id
       where membership.tenant_id = $1
         and membership.user_id <> $2
         and membership.role in ('owner', 'admin', 'accountant', 'employee')
         and membership.status = 'active'
         and user_row.deleted_at is null
       order by user_row.full_name`,
      [session.tenantId, session.userId],
    );
    return result.rows;
  });

  return NextResponse.json({ contacts });
}
