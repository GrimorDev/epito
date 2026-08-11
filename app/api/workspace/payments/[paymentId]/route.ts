import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { canEditTenantData } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ paymentId: string }> };

// Same allowlist as POST /api/workspace/payments (manual obligation entry) —
// marking something paid, or hand-linking a bank transaction to it, is an
// equally strong financial action and deliberately excludes "employee".
const canManagePayment = (role: string | null, platformRole: string) =>
  canEditTenantData(platformRole) || role === "owner" || role === "admin" || role === "accountant";

export async function PATCH(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canManagePayment(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { paymentId } = await context.params;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const status = body?.status;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";
  const matchTransactionId = typeof body?.matchTransactionId === "string" ? body.matchTransactionId : null;

  if (status !== "paid") {
    return NextResponse.json({ error: "Nieprawidłowa operacja." }, { status: 400 });
  }

  const updated = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const payment = await client.query<{ id: string }>(
      "select id from payments where id = $1 and status = 'due'",
      [paymentId],
    );
    if (!payment.rowCount) return false;

    if (matchTransactionId) {
      const transaction = await client.query<{ id: string }>(
        "select id from bank_statement_transactions where id = $1 and match_status != 'matched'",
        [matchTransactionId],
      );
      if (!transaction.rowCount) return false;
      await client.query(
        "update bank_statement_transactions set matched_payment_id = $1, match_status = 'matched' where id = $2",
        [paymentId, matchTransactionId],
      );
      await client.query(
        `update payments set status = 'paid', paid_at = now(), provider = 'bank_transfer', provider_reference = $1, updated_at = now() where id = $2`,
        [matchTransactionId, paymentId],
      );
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'payment.manually_matched', 'payment', $3, jsonb_build_object('bank_statement_transaction_id', $4::uuid))",
        [session.tenantId, session.userId, paymentId, matchTransactionId],
      );
      return true;
    }

    await client.query(
      `update payments set status = 'paid', paid_at = now(), provider = 'manual',
       metadata = metadata || jsonb_build_object('manual_note', $1::text), updated_at = now() where id = $2`,
      [note, paymentId],
    );
    await client.query(
      "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'payment.marked_paid', 'payment', $3, jsonb_build_object('note', $4::text))",
      [session.tenantId, session.userId, paymentId, note],
    );
    return true;
  });

  if (!updated) return NextResponse.json({ error: "Nie znaleziono płatności do rozliczenia." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
