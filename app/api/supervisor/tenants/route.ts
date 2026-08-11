import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/database";
import { hashPassword, validatePassword } from "@/lib/server/passwords";
import { canManageOrganizations, isPlatformStaff } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function databaseStatus(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;
}

function databaseConstraint(error: unknown) {
  return typeof error === "object" && error !== null && "constraint" in error
    ? String((error as { constraint?: unknown }).constraint)
    : null;
}

// Portal subdomains are assigned automatically (clientNNNN), never typed in
// by the supervisor — a human-chosen slug would leak the client's identity
// into a URL that's supposed to just be a stable, disposable login address.
function generateTenantSlug(): string {
  return `client${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session || !isPlatformStaff(session.platformRole)) {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
  }

  const tenants = await withUserTransaction(session.userId, async (client) => {
    const result = await client.query<{
      id: string;
      slug: string;
      legal_name: string;
      display_name: string;
      nip: string | null;
      status: string;
      created_at: string;
      clients_count: number;
      users_count: number;
      documents_count: number;
      requires_action_count: number;
      due_payments_count: number;
      failed_payments_count: number;
    }>(`
      select
        tenant.id,
        tenant.slug,
        tenant.legal_name,
        tenant.display_name,
        tenant.nip,
        tenant.status,
        tenant.created_at,
        (select count(*)::int from client_companies company where company.tenant_id = tenant.id and company.deleted_at is null) as clients_count,
        (select count(*)::int from tenant_memberships membership where membership.tenant_id = tenant.id and membership.status = 'active') as users_count,
        (select count(*)::int from documents document where document.tenant_id = tenant.id and document.deleted_at is null) as documents_count,
        (select count(*)::int from documents document where document.tenant_id = tenant.id and document.status = 'requires_action' and document.deleted_at is null) as requires_action_count,
        (select count(*)::int from payments payment where payment.tenant_id = tenant.id and payment.status in ('due', 'scheduled', 'processing')) as due_payments_count,
        (select count(*)::int from payments payment where payment.tenant_id = tenant.id and payment.status = 'failed') as failed_payments_count
      from tenants tenant
      where tenant.deleted_at is null
      order by tenant.created_at desc
    `);
    const activityResult = await client.query<{
      id: string;
      action: string;
      entity_type: string;
      created_at: string;
      tenant_name: string;
      actor_name: string | null;
    }>(`
      select activity.id, activity.action, activity.entity_type, activity.created_at,
        activity.tenant_name, activity.actor_name
      from (
        select audit.id::text as id, audit.action, audit.entity_type, audit.created_at,
          tenant.display_name as tenant_name, actor.full_name as actor_name
        from audit_log audit
        join tenants tenant on tenant.id = audit.tenant_id
        left join users actor on actor.id = audit.actor_user_id
        union all
        select concat('platform-', audit.id)::text as id, audit.action, audit.entity_type, audit.created_at,
          coalesce(audit.metadata->>'tenant_name', 'Platforma Epito') as tenant_name,
          actor.full_name as actor_name
        from platform_audit_log audit
        left join users actor on actor.id = audit.actor_user_id
      ) activity
      order by activity.created_at desc
      limit 10
    `);
    return { tenants: result.rows, activity: activityResult.rows };
  });

  const baseDomain = process.env.EPITO_BASE_DOMAIN?.trim() || "localhost";
  return NextResponse.json({
    tenants: tenants.tenants.map((tenant) => ({
      id: tenant.id,
      slug: tenant.slug,
      legalName: tenant.legal_name,
      displayName: tenant.display_name,
      nip: tenant.nip,
      status: tenant.status,
      createdAt: tenant.created_at,
      clientsCount: tenant.clients_count,
      usersCount: tenant.users_count,
      documentsCount: tenant.documents_count,
      requiresActionCount: tenant.requires_action_count,
      duePaymentsCount: tenant.due_payments_count,
      failedPaymentsCount: tenant.failed_payments_count,
      portalHost: `${tenant.slug}.${baseDomain}`,
    })),
    activity: tenants.activity.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entityType: entry.entity_type,
      createdAt: entry.created_at,
      tenantName: entry.tenant_name,
      actorName: entry.actor_name,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }

  const session = await getSession(request);
  if (!session || !canManageOrganizations(session.platformRole)) {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const legalName = typeof body?.legalName === "string" ? body.legalName.trim() : "";
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  const nip = typeof body?.nip === "string" ? body.nip.replace(/\D/g, "") : "";
  const ownerEmail = typeof body?.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  const ownerName = typeof body?.ownerName === "string" ? body.ownerName.trim() : "";
  const ownerPassword = typeof body?.ownerPassword === "string" ? body.ownerPassword : "";

  if (legalName.length < 2 || legalName.length > 180 || displayName.length < 2 || displayName.length > 100) {
    return NextResponse.json({ error: "Uzupełnij prawidłową nazwę organizacji." }, { status: 400 });
  }
  if (nip && nip.length !== 10) {
    return NextResponse.json({ error: "NIP musi mieć 10 cyfr." }, { status: 400 });
  }
  if (!emailPattern.test(ownerEmail) || ownerEmail.length > 254 || ownerName.length < 2 || ownerName.length > 120) {
    return NextResponse.json({ error: "Uzupełnij prawidłowe dane właściciela." }, { status: 400 });
  }
  const passwordError = validatePassword(ownerPassword);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const passwordHash = await hashPassword(ownerPassword);
  const MAX_SLUG_ATTEMPTS = 8;
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = generateTenantSlug();
    try {
      const created = await withUserTransaction(session.userId, async (client) => {
        const result = await client.query<{ tenant_id: string; owner_user_id: string }>(
          "select * from epito_create_tenant_with_owner($1, $2, $3, $4, $5, $6, $7)",
          [slug, legalName, displayName, nip || null, ownerEmail, ownerName, passwordHash],
        );
        return result.rows[0];
      });
      const baseDomain = process.env.EPITO_BASE_DOMAIN?.trim() || "localhost";
      return NextResponse.json(
        { ok: true, tenantId: created.tenant_id, portalHost: `${slug}.${baseDomain}` },
        { status: 201 },
      );
    } catch (error) {
      if (databaseStatus(error) === "23505") {
        // A collision on the auto-generated slug itself just means bad luck
        // on the random number — silently try a fresh one. Any other unique
        // violation (NIP or owner email already used) is a real conflict the
        // supervisor needs to see, not something a new slug would fix.
        if (databaseConstraint(error) === "tenants_slug_unique" && attempt < MAX_SLUG_ATTEMPTS) continue;
        return NextResponse.json({ error: "Taki NIP lub e-mail już istnieje." }, { status: 409 });
      }
      console.error("Tenant creation failed", error);
      return NextResponse.json({ error: "Nie udało się utworzyć organizacji." }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Nie udało się wygenerować unikalnego adresu portalu. Spróbuj ponownie." }, { status: 500 });
}
