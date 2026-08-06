import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/database";
import { hashPassword, validatePassword } from "@/lib/server/passwords";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slugPattern = /^[a-z0-9][a-z0-9-]{2,62}$/;

function databaseStatus(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session || session.platformRole !== "supervisor") {
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
        (select count(*)::int from tenant_memberships membership where membership.tenant_id = tenant.id and membership.status = 'active') as users_count
      from tenants tenant
      where tenant.deleted_at is null
      order by tenant.created_at desc
    `);
    return result.rows;
  });

  const baseDomain = process.env.EPITO_BASE_DOMAIN?.trim() || "localhost";
  return NextResponse.json({
    tenants: tenants.map((tenant) => ({
      id: tenant.id,
      slug: tenant.slug,
      legalName: tenant.legal_name,
      displayName: tenant.display_name,
      nip: tenant.nip,
      status: tenant.status,
      createdAt: tenant.created_at,
      clientsCount: tenant.clients_count,
      usersCount: tenant.users_count,
      portalHost: `${tenant.slug}.${baseDomain}`,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }

  const session = await getSession(request);
  if (!session || session.platformRole !== "supervisor") {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const legalName = typeof body?.legalName === "string" ? body.legalName.trim() : "";
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  const nip = typeof body?.nip === "string" ? body.nip.replace(/\D/g, "") : "";
  const ownerEmail = typeof body?.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  const ownerName = typeof body?.ownerName === "string" ? body.ownerName.trim() : "";
  const ownerPassword = typeof body?.ownerPassword === "string" ? body.ownerPassword : "";

  if (!slugPattern.test(slug)) {
    return NextResponse.json({ error: "Adres portalu może zawierać małe litery, cyfry i łącznik." }, { status: 400 });
  }
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
  try {
    const created = await withUserTransaction(session.userId, async (client) => {
      const result = await client.query<{ tenant_id: string; owner_user_id: string }>(
        "select * from epito_create_tenant_with_owner($1, $2, $3, $4, $5, $6, $7)",
        [slug, legalName, displayName, nip || null, ownerEmail, ownerName, passwordHash],
      );
      return result.rows[0];
    });
    return NextResponse.json({ ok: true, tenantId: created.tenant_id }, { status: 201 });
  } catch (error) {
    if (databaseStatus(error) === "23505") {
      return NextResponse.json({ error: "Taki adres portalu, NIP lub e-mail już istnieje." }, { status: 409 });
    }
    console.error("Tenant creation failed", error);
    return NextResponse.json({ error: "Nie udało się utworzyć organizacji." }, { status: 500 });
  }
}
