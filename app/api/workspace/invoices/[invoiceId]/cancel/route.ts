import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { canEditTenantData } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ invoiceId: string }> };

function canIssue(role: string | null, platformRole: string) {
  return canEditTenantData(platformRole) || ["owner", "admin", "accountant", "employee"].includes(role || "");
}

export async function POST(request: NextRequest, context: Context) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canIssue(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { invoiceId } = await context.params;

  const result = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const invoiceResult = await client.query<{ id: string; status: string; document_id: string | null; invoice_number: string }>(
      "select id, status, document_id, invoice_number from issued_invoices where id = $1 for update",
      [invoiceId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) return { error: "Nie znaleziono faktury.", code: 404 } as const;
    if (invoice.status !== "failed" && invoice.status !== "rejected") {
      return { error: "Można anulować tylko próbę zakończoną błędem lub odrzuconą przez KSeF.", code: 400 } as const;
    }

    await client.query("update issued_invoices set status = 'cancelled', updated_at = now() where id = $1", [invoiceId]);
    if (invoice.document_id) {
      await client.query("update documents set status = 'requires_action', updated_at = now() where id = $1", [invoice.document_id]);
    }
    await client.query(
      "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data) values ($1, $2, 'invoice.cancelled', 'issued_invoice', $3, jsonb_build_object('status', $4::text), jsonb_build_object('status', 'cancelled', 'invoice_number', $5::text))",
      [session.tenantId, session.userId, invoiceId, invoice.status, invoice.invoice_number],
    );
    return { ok: true } as const;
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });
  return NextResponse.json({ ok: true });
}
