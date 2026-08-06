import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin, updateSessionTenant } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session || session.platformRole !== "supervisor") {
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
  await updateSessionTenant(request, {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.display_name,
    membershipRole: null,
  });
  return NextResponse.json({ ok: true, redirectTo: "/workspace" });
}
