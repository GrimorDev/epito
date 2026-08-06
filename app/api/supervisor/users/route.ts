import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session || session.platformRole !== "supervisor") {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
  }

  const users = await withUserTransaction(session.userId, async (client) => {
    const result = await client.query<{
      id: string;
      email: string;
      full_name: string;
      status: string;
      platform_role: string;
      tenant_name: string | null;
      membership_role: string | null;
      created_at: string;
    }>(`
      select user_row.id, user_row.email, user_row.full_name, user_row.status,
        user_row.platform_role, tenant.display_name as tenant_name,
        membership.role as membership_role, user_row.created_at
      from users user_row
      left join tenant_memberships membership on membership.user_id = user_row.id and membership.status = 'active'
      left join tenants tenant on tenant.id = membership.tenant_id
      where user_row.deleted_at is null
      order by user_row.created_at desc, tenant.display_name
      limit 500
    `);
    return result.rows;
  });
  return NextResponse.json({ users });
}
