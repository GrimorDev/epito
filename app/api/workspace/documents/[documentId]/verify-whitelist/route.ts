import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { enqueueWhitelistVerify } from "@/lib/server/queues";
import { canEditTenantData } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ documentId: string }> };

function canVerify(role: string | null, platformRole: string) {
  return canEditTenantData(platformRole) || ["owner", "admin", "accountant", "employee"].includes(role || "");
}

// Only enqueues the job — the actual call to wl-api.mf.gov.pl happens in
// scripts/ksef-worker.mjs (handleWhitelistVerify), the only process with
// outbound internet egress. The result lands in documents.structured_data
// on the next overview refresh, same as document.analyze re-checks.
export async function POST(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canVerify(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { documentId } = await context.params;

  const document = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query<{ id: string; seller_nip: string | null; bank_account: string | null }>(
      `select id, structured_data->'ksef'->>'seller_nip' as seller_nip, structured_data->'ksef'->>'bank_account' as bank_account
       from documents where id = $1 and deleted_at is null`,
      [documentId],
    );
    return result.rows[0] || null;
  });
  if (!document) return NextResponse.json({ error: "Nie znaleziono dokumentu." }, { status: 404 });
  if (!document.seller_nip || !document.bank_account) {
    return NextResponse.json({ error: "Ten dokument nie ma zapisanego NIP-u i rachunku sprzedawcy do sprawdzenia." }, { status: 400 });
  }

  await enqueueWhitelistVerify(documentId, session.tenantId, session.userId);
  return NextResponse.json({ ok: true });
}
