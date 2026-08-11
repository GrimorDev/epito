import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin, updateSessionTenant } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/database";
import { isPlatformStaff } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session || !isPlatformStaff(session.platformRole)) {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { tenantId?: unknown } | null;
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
  const tenant = await withUserTransaction(session.userId, async (client) => {
    const result = await client.query<{ id: string; slug: string; display_name: string }>(
      "select id, slug, display_name from tenants where id = $1 and status = 'active' and deleted_at is null",
      [tenantId],
    );
    return result.rows[0] ?? null;
  }).catch(() => null);

  if (!tenant) {
    return NextResponse.json({ error: "Nie znaleziono aktywnej organizacji." }, { status: 404 });
  }
  await withUserTransaction(session.userId, (client) => client.query(
    `insert into platform_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, 'tenant.support_accessed', 'tenant', $2, jsonb_build_object('tenant_name', $3, 'platform_role', $4))`,
    [session.userId, tenant.id, tenant.display_name, session.platformRole],
  ));
  await updateSessionTenant(request, {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.display_name,
    membershipRole: null,
  });
  return NextResponse.json({ ok: true, redirectTo: "/workspace" });
}
