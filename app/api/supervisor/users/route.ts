import { NextRequest, NextResponse } from "next/server";
import { canEditTenantData, canManagePlatformTeam, platformRoles } from "@/lib/platform-access";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/database";
import { hashPassword, validatePassword } from "@/lib/server/passwords";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const membershipRoles = ["owner", "admin", "accountant", "employee", "viewer"] as const;
const membershipStatuses = ["active", "blocked"] as const;
const platformStatuses = ["active", "blocked"] as const;

function databaseStatus(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session || !canEditTenantData(session.platformRole)) {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
  }

  const users = await withUserTransaction(session.userId, async (client) => {
    const result = await client.query<{
      id: string;
      email: string;
      full_name: string;
      status: string;
      platform_role: string;
      mfa_enabled: boolean;
      last_login_at: string | null;
      tenant_id: string | null;
      tenant_slug: string | null;
      tenant_name: string | null;
      membership_role: string | null;
      membership_status: string | null;
      permissions: Record<string, boolean> | null;
      created_at: string;
    }>(`
      select user_row.id, user_row.email, user_row.full_name, user_row.status,
        user_row.platform_role, user_row.mfa_enabled, user_row.last_login_at,
        tenant.id as tenant_id, tenant.slug as tenant_slug, tenant.display_name as tenant_name,
        membership.role as membership_role, membership.status as membership_status,
        membership.permissions, user_row.created_at
      from users user_row
      left join tenant_memberships membership on membership.user_id = user_row.id
      left join tenants tenant on tenant.id = membership.tenant_id and tenant.deleted_at is null
      where user_row.deleted_at is null
      order by
        case when user_row.platform_role <> 'none' then 0 else 1 end,
        tenant.display_name nulls first,
        user_row.full_name
      limit 1000
    `);
    return result.rows;
  });

  return NextResponse.json({ users, canManageTeam: canManagePlatformTeam(session.platformRole) });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session || !canManagePlatformTeam(session.platformRole)) {
    return NextResponse.json({ error: "Tylko supervisor może dodawać konta zespołu platformy." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const platformRole = typeof body?.platformRole === "string" ? body.platformRole : "";

  if (fullName.length < 2 || fullName.length > 120 || !emailPattern.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Uzupełnij prawidłowe dane użytkownika." }, { status: 400 });
  }
  if (!platformRoles.includes(platformRole as (typeof platformRoles)[number])) {
    return NextResponse.json({ error: "Wybierz prawidłową rolę platformową." }, { status: 400 });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const passwordHash = await hashPassword(password);
  try {
    const user = await withUserTransaction(session.userId, async (client) => {
      const created = await client.query<{ id: string }>(
        `insert into users (email, full_name, status, platform_role)
         values ($1, $2, 'active', $3)
         returning id`,
        [email, fullName, platformRole],
      );
      const userId = created.rows[0].id;
      await client.query("insert into user_credentials (user_id, password_hash) values ($1, $2)", [userId, passwordHash]);
      await client.query(
        `insert into platform_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
         values ($1, 'platform_user.created', 'user', $2, jsonb_build_object('email', $3::text, 'role', $4::text))`,
        [session.userId, userId, email, platformRole],
      );
      return { id: userId };
    });
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (error) {
    if (databaseStatus(error) === "23505") {
      return NextResponse.json({ error: "Konto z tym adresem e-mail już istnieje." }, { status: 409 });
    }
    console.error("Platform user creation failed", error);
    return NextResponse.json({ error: "Nie udało się utworzyć konta zespołu." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session || !canManagePlatformTeam(session.platformRole)) {
    return NextResponse.json({ error: "Tylko supervisor może zmieniać uprawnienia." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) return NextResponse.json({ error: "Brakuje identyfikatora użytkownika." }, { status: 400 });

  try {
    if (action === "platform") {
      const platformRole = typeof body?.platformRole === "string" ? body.platformRole : "";
      const status = typeof body?.status === "string" ? body.status : "";
      if (!platformRoles.includes(platformRole as (typeof platformRoles)[number]) || !platformStatuses.includes(status as (typeof platformStatuses)[number])) {
        return NextResponse.json({ error: "Nieprawidłowa rola lub status konta." }, { status: 400 });
      }
      if (userId === session.userId) {
        return NextResponse.json({ error: "Nie możesz zmienić roli ani zablokować własnego konta." }, { status: 400 });
      }

      await withUserTransaction(session.userId, async (client) => {
        const target = await client.query<{ platform_role: string; status: string }>(
          "select platform_role, status from users where id = $1 and deleted_at is null for update",
          [userId],
        );
        if (!target.rows[0] || target.rows[0].platform_role === "none") throw new Error("NOT_PLATFORM_USER");
        if (target.rows[0].platform_role === "supervisor" && (platformRole !== "supervisor" || status !== "active")) {
          const supervisors = await client.query<{ count: string }>(
            "select count(*)::text as count from users where platform_role = 'supervisor' and status = 'active' and deleted_at is null",
          );
          if (Number(supervisors.rows[0]?.count || 0) <= 1) throw new Error("LAST_SUPERVISOR");
        }
        await client.query(
          "update users set platform_role = $1, status = $2, auth_version = auth_version + 1, updated_at = now() where id = $3",
          [platformRole, status, userId],
        );
        await client.query(
          `insert into platform_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
           values ($1, 'platform_user.updated', 'user', $2, jsonb_build_object('role', $3::text, 'status', $4::text))`,
          [session.userId, userId, platformRole, status],
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "membership") {
      const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
      const role = typeof body?.role === "string" ? body.role : "";
      const status = typeof body?.status === "string" ? body.status : "";
      if (!tenantId || !membershipRoles.includes(role as (typeof membershipRoles)[number]) || !membershipStatuses.includes(status as (typeof membershipStatuses)[number])) {
        return NextResponse.json({ error: "Nieprawidłowa rola lub status członkostwa." }, { status: 400 });
      }

      await withUserTransaction(session.userId, async (client) => {
        const membership = await client.query<{ role: string; status: string }>(
          "select role, status from tenant_memberships where tenant_id = $1 and user_id = $2 for update",
          [tenantId, userId],
        );
        if (!membership.rows[0]) throw new Error("MEMBERSHIP_NOT_FOUND");
        if (membership.rows[0].role === "owner" && (role !== "owner" || status !== "active")) {
          const owners = await client.query<{ count: string }>(
            "select count(*)::text as count from tenant_memberships where tenant_id = $1 and role = 'owner' and status = 'active'",
            [tenantId],
          );
          if (Number(owners.rows[0]?.count || 0) <= 1) throw new Error("LAST_OWNER");
        }
        await client.query(
          "update tenant_memberships set role = $1, status = $2, updated_at = now() where tenant_id = $3 and user_id = $4",
          [role, status, tenantId, userId],
        );
        await client.query(
          "update users set auth_version = auth_version + 1, updated_at = now() where id = $1",
          [userId],
        );
        await client.query(
          `insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
           values ($1, $2, 'membership.updated', 'user', $3, jsonb_build_object('role', $4::text, 'status', $5::text))`,
          [tenantId, session.userId, userId, role, status],
        );
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Nieznana operacja." }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "LAST_SUPERVISOR") return NextResponse.json({ error: "Platforma musi mieć co najmniej jednego aktywnego supervisora." }, { status: 409 });
    if (code === "LAST_OWNER") return NextResponse.json({ error: "Organizacja musi mieć co najmniej jednego aktywnego właściciela." }, { status: 409 });
    if (code === "NOT_PLATFORM_USER" || code === "MEMBERSHIP_NOT_FOUND") return NextResponse.json({ error: "Nie znaleziono wskazanego dostępu." }, { status: 404 });
    console.error("User access update failed", error);
    return NextResponse.json({ error: "Nie udało się zaktualizować uprawnień." }, { status: 500 });
  }
}
