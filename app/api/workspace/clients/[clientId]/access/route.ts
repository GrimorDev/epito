import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { canManageTeam } from "@/lib/tenant-access";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { enqueueBackgroundJob } from "@/lib/server/queues";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clientRoles = new Set(["employee", "viewer"]);

function invitationOrigin(request: NextRequest, tenantSlug: string) {
  const baseDomain = process.env.EPITO_BASE_DOMAIN?.trim().replace(/^\.+|\.+$/g, "");
  if (!baseDomain) return request.nextUrl.origin;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "http" ? "http" : "https";
  return `${protocol}://${tenantSlug}.${baseDomain}`;
}

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  const session = await getSession(request);
  if (!session?.tenantId || !canManageTeam(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { clientId } = await context.params;
  if (!validId(clientId)) return NextResponse.json({ error: "Nieprawidłowy identyfikator klienta." }, { status: 400 });

  const result = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const company = await client.query<{ id: string; name: string }>("select id, name from client_companies where id = $1 and deleted_at is null", [clientId]);
    if (!company.rows[0]) return null;
    await client.query("update account_invitations set status = 'expired', updated_at = now() where client_company_id = $1 and status = 'pending' and expires_at <= now()", [clientId]);
    const invitations = await client.query<{
      id: string;
      email: string;
      full_name: string;
      membership_role: string;
      status: string;
      expires_at: string;
      accepted_at: string | null;
      created_at: string;
    }>(`select id, email, full_name, membership_role, status, expires_at, accepted_at, created_at
        from account_invitations where client_company_id = $1 order by created_at desc limit 50`, [clientId]);
    const members = await client.query<{
      id: string;
      email: string;
      full_name: string;
      role: string;
      status: string;
      last_login_at: string | null;
    }>(`select user_row.id, user_row.email, user_row.full_name, membership.role, membership.status, user_row.last_login_at
        from client_company_memberships membership
        join users user_row on user_row.id = membership.user_id
        where membership.client_company_id = $1 and user_row.deleted_at is null
        order by user_row.full_name`, [clientId]);
    return { company: company.rows[0], invitations: invitations.rows, members: members.rows };
  });
  if (!result) return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canManageTeam(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { clientId } = await context.params;
  if (!validId(clientId)) return NextResponse.json({ error: "Nieprawidłowy identyfikator klienta." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const role = typeof body?.role === "string" ? body.role : "viewer";
  if (!emailPattern.test(email) || email.length > 254 || fullName.length < 2 || fullName.length > 120 || !clientRoles.has(role)) {
    return NextResponse.json({ error: "Uzupełnij prawidłowe dane użytkownika klienta." }, { status: 400 });
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  try {
    const invitation = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      const contextResult = await client.query<{ tenant_slug: string; tenant_name: string; company_name: string }>(`
        select tenant.slug as tenant_slug, tenant.display_name as tenant_name, company.name as company_name
        from tenants tenant join client_companies company on company.tenant_id = tenant.id
        where tenant.id = $1 and company.id = $2 and company.deleted_at is null
      `, [session.tenantId, clientId]);
      if (!contextResult.rows[0]) throw new Error("CLIENT_NOT_FOUND");
      const created = await client.query<{ invitation_id: string }>(
        "select epito_create_client_invitation($1, $2, $3, $4, $5, $6) as invitation_id",
        [clientId, email, fullName, role, tokenHash, expiresAt.toISOString()],
      );
      return { id: created.rows[0].invitation_id, ...contextResult.rows[0] };
    });

    const activationUrl = `${invitationOrigin(request, invitation.tenant_slug)}/aktywacja?token=${encodeURIComponent(token)}`;
    let emailQueued = true;
    try {
      await enqueueBackgroundJob("integrations", {
        tenantId: session.tenantId,
        actorUserId: session.userId,
        type: "account.invite",
        payload: {
          email,
          fullName,
          tenantName: invitation.tenant_name,
          companyName: invitation.company_name,
          activationUrl,
          expiresAt: expiresAt.toLocaleString("pl-PL"),
        },
        createdAt: new Date().toISOString(),
      }, { jobId: `account-invite-${invitation.id}` });
    } catch (queueError) {
      emailQueued = false;
      console.error("Account invitation enqueue failed", queueError);
    }
    return NextResponse.json({ ok: true, invitationId: invitation.id, activationUrl, emailQueued, expiresAt: expiresAt.toISOString() }, { status: 201 });
  } catch (error) {
    const databaseCode = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (databaseCode === "23505") return NextResponse.json({ error: "Konto z tym adresem e-mail już istnieje." }, { status: 409 });
    if (error instanceof Error && error.message === "CLIENT_NOT_FOUND") return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
    console.error("Client invitation failed", error);
    return NextResponse.json({ error: "Nie udało się utworzyć zaproszenia." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canManageTeam(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }
  const { clientId } = await context.params;
  const body = (await request.json().catch(() => null)) as { invitationId?: unknown } | null;
  const invitationId = typeof body?.invitationId === "string" ? body.invitationId : "";
  if (!validId(clientId) || !validId(invitationId)) return NextResponse.json({ error: "Nieprawidłowe dane zaproszenia." }, { status: 400 });
  const revoked = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query("update account_invitations set status = 'revoked', updated_at = now() where id = $1 and client_company_id = $2 and status = 'pending'", [invitationId, clientId]);
    if (result.rowCount) {
      await client.query("insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id) values ($1, $2, 'client_access.revoked', 'account_invitation', $3)", [session.tenantId, session.userId, invitationId]);
    }
    return Boolean(result.rowCount);
  });
  if (!revoked) return NextResponse.json({ error: "Zaproszenie nie jest już aktywne." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
