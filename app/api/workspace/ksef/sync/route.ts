import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { enqueueBackgroundJob } from "@/lib/server/queues";
import { canMutateFinancials } from "@/lib/tenant-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session?.tenantId || !canMutateFinancials(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId : "";
  if (!connectionId) return NextResponse.json({ error: "Podaj identyfikator połączenia." }, { status: 400 });

  const exists = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query("select id from ksef_connections where id = $1", [connectionId]);
    return result.rowCount ? true : false;
  });
  if (!exists) return NextResponse.json({ error: "Nie znaleziono połączenia KSeF." }, { status: 404 });

  try {
    await enqueueBackgroundJob("integrations", {
      tenantId: session.tenantId,
      actorUserId: session.userId,
      type: "ksef.sync",
      payload: { connectionId },
      createdAt: new Date().toISOString(),
    }, { jobId: `ksef-sync-${connectionId}-${Date.now()}` });
  } catch (error) {
    console.error("KSeF sync enqueue failed", error);
    return NextResponse.json({ error: "Nie udało się uruchomić synchronizacji. Spróbuj ponownie." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}
