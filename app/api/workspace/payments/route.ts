import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { canEditTenantData } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const taxTypes = new Set(["vat", "pit", "cit", "zus", "invoice", "other"]);

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  const allowed = canEditTenantData(session?.platformRole) || ["owner", "admin", "accountant"].includes(session?.membershipRole || "");
  if (!session?.tenantId || !allowed) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const clientCompanyId = typeof body?.clientCompanyId === "string" ? body.clientCompanyId : "";
  const taxType = typeof body?.taxType === "string" ? body.taxType : "";
  const periodLabel = typeof body?.periodLabel === "string" ? body.periodLabel.trim() : "";
  const amount = typeof body?.amount === "string" || typeof body?.amount === "number" ? Number(body.amount) : Number.NaN;
  const dueDate = typeof body?.dueDate === "string" ? body.dueDate : "";
  const rawBankAccountNumber = typeof body?.bankAccountNumber === "string" ? body.bankAccountNumber.trim() : "";
  const bankAccountNumber = rawBankAccountNumber.replace(/[\s-]/g, "");
  const recipientName = typeof body?.recipientName === "string" ? body.recipientName.trim() : "";
  const transferTitle = typeof body?.transferTitle === "string" ? body.transferTitle.trim() : "";
  if (!clientCompanyId || !taxTypes.has(taxType) || periodLabel.length < 2 || periodLabel.length > 80 || !Number.isFinite(amount) || amount <= 0 || amount > 999_999_999 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || (bankAccountNumber && (!/^\d{26}$/.test(bankAccountNumber) || recipientName.length < 2)) || recipientName.length > 180 || transferTitle.length > 110) {
    return NextResponse.json({ error: "Uzupełnij prawidłowe dane płatności." }, { status: 400 });
  }

  try {
    const paymentId = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      const company = await client.query("select id from client_companies where id = $1 and deleted_at is null", [clientCompanyId]);
      if (!company.rowCount) return null;
      const result = await client.query<{ id: string; payment_reference: string }>(
        "insert into payments (tenant_id, client_company_id, tax_type, period_label, amount, due_date, status, metadata) values ($1, $2, $3, $4, $5, $6, 'due', $7::jsonb) returning id, payment_reference",
        [session.tenantId, clientCompanyId, taxType, periodLabel, amount, dueDate, JSON.stringify({ ...(recipientName ? { recipient_name: recipientName } : {}), ...(bankAccountNumber ? { bank_account_number: bankAccountNumber } : {}), ...(transferTitle ? { transfer_title: transferTitle } : {}) })],
      );
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'payment.created', 'payment', $3, jsonb_build_object('tax_type', $4::text, 'amount', $5::numeric))",
        [session.tenantId, session.userId, result.rows[0].id, taxType, amount],
      );
      return result.rows[0];
    });
    if (!paymentId) return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
    return NextResponse.json({ ok: true, paymentId: paymentId.id, paymentReference: paymentId.payment_reference }, { status: 201 });
  } catch (error) {
    console.error("Payment creation failed", error);
    return NextResponse.json({ error: "Nie udało się dodać płatności." }, { status: 500 });
  }
}
