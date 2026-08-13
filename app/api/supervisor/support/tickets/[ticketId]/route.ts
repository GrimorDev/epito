import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/database";
import { isPlatformStaff } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ ticketId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session || !isPlatformStaff(session.platformRole)) {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
  }
  const { ticketId } = await context.params;

  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = typeof body?.status === "string" ? body.status : "";
  if (status !== "open" && status !== "closed") {
    return NextResponse.json({ error: "Nieprawidłowy status." }, { status: 400 });
  }

  const updated = await withUserTransaction(session.userId, async (client) => {
    const result = await client.query("update support_tickets set status = $1, updated_at = now() where id = $2", [status, ticketId]);
    return result.rowCount ? true : false;
  });

  if (!updated) return NextResponse.json({ error: "Nie znaleziono zgłoszenia." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
