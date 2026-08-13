import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { canMutateFinancials } from "@/lib/tenant-access";
import { enqueueInvoiceIssue } from "@/lib/server/queues";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ invoiceId: string }> };

// Re-submits the SAME invoice_number/invoice_xml already stored on the row
// — no new invoice is created, matching KSeF's own duplicate rule (seller
// NIP + RodzajFaktury + invoice number must stay unique). Only meaningful
// for "failed" (our own transient error — network, auth, a bug since fixed)
// "rejected" (KSeF's definitive answer, but the underlying cause — e.g.
// a since-corrected NIP mismatch — may no longer apply) invoices; "queued"/
// "submitted" are already in flight, and "accepted" is KSeF's final word.
// A locally "cancelled" attempt can also be resumed with the exact stored XML.
export async function POST(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canMutateFinancials(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { invoiceId } = await context.params;

  const result = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const invoiceResult = await client.query<{ id: string; status: string; document_id: string | null; invoice_number: string }>(
      "select id, status, document_id, invoice_number from issued_invoices where id = $1",
      [invoiceId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) return { error: "Nie znaleziono faktury.", code: 404 } as const;
    if (invoice.status !== "failed" && invoice.status !== "rejected" && invoice.status !== "cancelled") {
      return { error: "Tę fakturę można ponowić tylko po błędzie, odrzuceniu lub anulowaniu lokalnej próby.", code: 400 } as const;
    }

    await client.query(
      `update issued_invoices set status = 'queued', error_message = null,
        ksef_session_reference = null, ksef_invoice_reference = null, updated_at = now()
       where id = $1`,
      [invoiceId],
    );
    if (invoice.document_id) {
      await client.query("update documents set status = 'processing', updated_at = now() where id = $1", [invoice.document_id]);
    }
    await client.query(
      "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'invoice.retry_requested', 'issued_invoice', $3, jsonb_build_object('invoice_number', $4::text))",
      [session.tenantId, session.userId, invoiceId, invoice.invoice_number],
    );
    return { ok: true } as const;
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });

  await enqueueInvoiceIssue(invoiceId, session.tenantId, session.userId);
  return NextResponse.json({ ok: true });
}
