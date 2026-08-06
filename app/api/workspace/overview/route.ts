import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Wybierz organizację." }, { status: 401 });
  }

  const data = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const [tenantResult, companiesResult, teamResult, statsResult] = await Promise.all([
      client.query<{ id: string; slug: string; display_name: string; legal_name: string; nip: string | null }>(
        "select id, slug, display_name, legal_name, nip from tenants where id = $1",
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
      client.query<{ id: string; email: string; full_name: string; role: string; status: string }>(`
        select user_row.id, user_row.email, user_row.full_name, membership.role, membership.status
        from tenant_memberships membership
        join users user_row on user_row.id = membership.user_id
        where membership.tenant_id = $1 and user_row.deleted_at is null
        order by case membership.role when 'owner' then 0 when 'admin' then 1 else 2 end, user_row.full_name
      `, [session.tenantId]),
      client.query<{ clients_count: number; documents_count: number; payments_due_count: number; payments_due_total: string }>(`
        select
          (select count(*)::int from client_companies where deleted_at is null) as clients_count,
          (select count(*)::int from documents where deleted_at is null) as documents_count,
          (select count(*)::int from payments where status in ('due', 'failed')) as payments_due_count,
          (select coalesce(sum(amount), 0)::text from payments where status in ('due', 'failed')) as payments_due_total
      `),
    ]);

    return {
      tenant: tenantResult.rows[0],
      companies: companiesResult.rows,
      team: teamResult.rows,
      stats: statsResult.rows[0],
    };
  });

  if (!data.tenant) {
    return NextResponse.json({ error: "Organizacja nie istnieje." }, { status: 404 });
  }
  return NextResponse.json(data);
}
