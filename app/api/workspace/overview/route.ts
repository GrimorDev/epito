import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { canAccessOffice, canManageTeam, canViewFinancials } from "@/lib/tenant-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Wybierz organizację." }, { status: 401 });
  }

  const canTeam = canManageTeam(session.membershipRole, session.platformRole);
  const canFinancials = canViewFinancials(session.membershipRole, session.platformRole);
  const canOffice = canAccessOffice(session.membershipRole, session.platformRole);

  const data = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const [tenantResult, companiesResult, teamResult, documentsResult, paymentsResult, statsResult, ksefConnectionsResult, bankTransactionsResult] = await Promise.all([
      client.query<{ id: string; slug: string; display_name: string; legal_name: string; nip: string | null; settings: Record<string, unknown> }>(
        "select id, slug, display_name, legal_name, nip, settings from tenants where id = $1",
        [session.tenantId],
      ),
      client.query<{
        id: string;
        name: string;
        nip: string | null;
        email: string | null;
        phone: string | null;
        status: string;
        created_at: string;
        documents_count: number;
        payments_count: number;
      }>(`
        select company.id, company.name, company.nip, company.email, company.phone, company.status, company.created_at,
          (select count(*)::int from documents document where document.client_company_id = company.id and document.deleted_at is null) as documents_count,
          (select count(*)::int from payments payment where payment.client_company_id = company.id) as payments_count
        from client_companies company
        where company.deleted_at is null
        order by company.created_at desc
      `),
      canTeam ? client.query<{ id: string; email: string; full_name: string; role: string; status: string }>(`
        select user_row.id, user_row.email, user_row.full_name, membership.role, membership.status
        from tenant_memberships membership
        join users user_row on user_row.id = membership.user_id
        where membership.tenant_id = $1 and user_row.deleted_at is null
        order by case membership.role when 'owner' then 0 when 'admin' then 1 else 2 end, user_row.full_name
      `, [session.tenantId]) : Promise.resolve({ rows: [] }),
      client.query<{
        id: string;
        name: string;
        category: string;
        status: string;
        document_year: number;
        document_month: number;
        amount: string | null;
        currency: string;
        issued_at: string | null;
        mime_type: string;
        file_size: number;
        structured_data: Record<string, unknown>;
        company_name: string;
        created_at: string;
        issued_invoice_id: string | null;
        issued_invoice_number: string | null;
        issued_invoice_status: string | null;
        issued_invoice_error: string | null;
        issued_invoice_created_at: string | null;
        issued_invoice_updated_at: string | null;
        issued_invoice_environment: string | null;
        issued_invoice_reference: string | null;
        ksef_number: string | null;
      }>(`
        select document.id, document.name, document.category, document.status,
          document.document_year, document.document_month, document.amount::text,
          document.currency, document.issued_at::text, document.mime_type, document.file_size,
          document.structured_data, company.name as company_name, document.created_at,
          invoice.id as issued_invoice_id, invoice.invoice_number as issued_invoice_number,
          invoice.status as issued_invoice_status, invoice.error_message as issued_invoice_error,
          invoice.created_at as issued_invoice_created_at, invoice.updated_at as issued_invoice_updated_at,
          invoice.ksef_environment as issued_invoice_environment,
          invoice.ksef_invoice_reference as issued_invoice_reference,
          invoice.ksef_number
        from documents document
        join client_companies company on company.id = document.client_company_id
        left join issued_invoices invoice on invoice.document_id = document.id
        where document.deleted_at is null
        order by document.created_at desc
        limit 250
      `),
      canFinancials ? client.query<{
        id: string;
        tax_type: string;
        period_label: string;
        amount: string;
        currency: string;
        due_date: string;
        status: string;
        company_name: string;
        recipient_name: string | null;
        bank_account_number: string | null;
        transfer_title: string | null;
        created_at: string;
        payment_reference: string | null;
        payment_source: string | null;
      }>(`
        select payment.id, payment.tax_type, payment.period_label, payment.amount::text,
          payment.currency, payment.due_date::text, payment.status,
          company.name as company_name,
          coalesce(payment.metadata->>'recipient_name', case when payment.tax_type = 'invoice' then company.name end) as recipient_name,
          coalesce(invoice.bank_account_number, payment.metadata->>'bank_account_number') as bank_account_number,
          coalesce(payment.metadata->>'transfer_title', payment.metadata->>'invoice_number') as transfer_title,
          payment.created_at,
          payment.payment_reference, payment.metadata->>'source' as payment_source
        from payments payment
        join client_companies company on company.id = payment.client_company_id
        left join issued_invoices invoice on invoice.document_id = payment.document_id
        order by payment.due_date asc, payment.created_at desc
        limit 250
      `) : Promise.resolve({ rows: [] }),
      client.query<{ clients_count: number; documents_count: number; payments_due_count: number; payments_due_total: string }>(`
        select
          (select count(*)::int from client_companies where deleted_at is null) as clients_count,
          (select count(*)::int from documents where deleted_at is null) as documents_count,
          (select count(*)::int from payments where status in ('due', 'failed')) as payments_due_count,
          (select coalesce(sum(amount), 0)::text from payments where status in ('due', 'failed')) as payments_due_total
      `),
      canOffice ? client.query<{
        id: string;
        client_company_id: string;
        client_company_name: string;
        environment: string;
        nip: string;
        status: string;
        last_synced_at: string | null;
        last_error: string | null;
        created_at: string;
      }>(`
        select connection.id, connection.client_company_id, company.name as client_company_name,
          connection.environment, connection.nip, connection.status, connection.last_synced_at,
          connection.last_error, connection.created_at
        from ksef_connections connection
        join client_companies company on company.id = connection.client_company_id
        where company.deleted_at is null
        order by company.name
      `) : Promise.resolve({ rows: [] }),
      canOffice ? client.query<{
        id: string;
        client_company_id: string;
        company_name: string;
        value_date: string;
        direction: "credit" | "debit";
        amount: string;
        currency: string;
        description: string;
        match_status: string;
        matched_payment_id: string | null;
      }>(`
        select transaction.id, transaction.client_company_id, company.name as company_name,
          transaction.value_date::text, transaction.direction, transaction.amount::text, transaction.currency,
          transaction.description, transaction.match_status, transaction.matched_payment_id
        from bank_statement_transactions transaction
        join client_companies company on company.id = transaction.client_company_id
        where transaction.match_status != 'matched'
        order by transaction.value_date desc, transaction.created_at desc
        limit 100
      `) : Promise.resolve({ rows: [] }),
    ]);

    return {
      tenant: tenantResult.rows[0],
      companies: companiesResult.rows,
      team: teamResult.rows,
      documents: documentsResult.rows,
      payments: paymentsResult.rows,
      stats: statsResult.rows[0],
      ksefConnections: ksefConnectionsResult.rows,
      bankTransactions: bankTransactionsResult.rows,
    };
  });

  if (!data.tenant) {
    return NextResponse.json({ error: "Organizacja nie istnieje." }, { status: 404 });
  }

  return NextResponse.json({
    ...data,
    team: canTeam ? data.team : [],
    payments: canFinancials ? data.payments : [],
    ksefConnections: canOffice ? data.ksefConnections : [],
    bankTransactions: canOffice ? data.bankTransactions : [],
    stats: canFinancials ? data.stats : { ...data.stats, payments_due_count: 0, payments_due_total: "0" },
  });
}
