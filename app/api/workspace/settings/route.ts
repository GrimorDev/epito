import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { canEditTenantData } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  const allowed = canEditTenantData(session?.platformRole) || ["owner", "admin"].includes(session?.membershipRole || "");
  if (!session?.tenantId || !allowed) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const saved = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      const currentResult = await client.query<{
        display_name: string;
        legal_name: string;
        nip: string | null;
        settings: {
          branding?: { accentColor?: string; headerName?: string };
          notifications?: { email?: boolean; paymentReminders?: boolean };
        };
      }>("select display_name, legal_name, nip, settings from tenants where id = $1 for update", [session.tenantId]);
      const current = currentResult.rows[0];
      if (!current) throw new Error("TENANT_NOT_FOUND");

      const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : current.display_name;
      const legalName = typeof body?.legalName === "string" ? body.legalName.trim() : current.legal_name;
      const nip = typeof body?.nip === "string" ? body.nip.replace(/\D/g, "") : (current.nip || "");
      const accentColor = typeof body?.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(body.accentColor)
        ? body.accentColor.toUpperCase()
        : (current.settings?.branding?.accentColor || "#CAFF65");
      const headerName = typeof body?.headerName === "string"
        ? body.headerName.trim()
        : (current.settings?.branding?.headerName || displayName);
      const paymentReminders = typeof body?.paymentReminders === "boolean"
        ? body.paymentReminders
        : (current.settings?.notifications?.paymentReminders ?? true);

      if (displayName.length < 2 || displayName.length > 100 || legalName.length < 2 || legalName.length > 180 || (nip && nip.length !== 10)) {
        throw new Error("INVALID_ORGANIZATION");
      }
      if (headerName.length < 2 || headerName.length > 100) throw new Error("INVALID_HEADER");

      const settingsPatch = {
        branding: { accentColor, headerName },
        notifications: { paymentReminders },
      };
      await client.query(
        `update tenants set display_name = $1, legal_name = $2, nip = $3,
          settings = jsonb_set(
            jsonb_set(coalesce(settings, '{}'::jsonb), '{branding}', coalesce(settings->'branding', '{}'::jsonb) || $4::jsonb, true),
            '{notifications}', coalesce(settings->'notifications', '{}'::jsonb) || $5::jsonb, true
          ),
          updated_at = now() where id = $6`,
        [displayName, legalName, nip || null, JSON.stringify(settingsPatch.branding), JSON.stringify(settingsPatch.notifications), session.tenantId],
      );
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'tenant.updated', 'tenant', $1, jsonb_build_object('display_name', $3::text, 'legal_name', $4::text, 'nip', $5::text))",
        [session.tenantId, session.userId, displayName, legalName, nip || null],
      );
      return settingsPatch;
    });
    return NextResponse.json({ ok: true, settings: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_ORGANIZATION") return NextResponse.json({ error: "Uzupełnij prawidłowe dane organizacji." }, { status: 400 });
    if (message === "INVALID_HEADER") return NextResponse.json({ error: "Podaj prawidłową nazwę w nagłówku." }, { status: 400 });
    if (message === "TENANT_NOT_FOUND") return NextResponse.json({ error: "Organizacja nie istnieje." }, { status: 404 });
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "23505") return NextResponse.json({ error: "Organizacja z tym NIP już istnieje." }, { status: 409 });
    console.error("Tenant settings update failed", error);
    return NextResponse.json({ error: "Nie udało się zapisać ustawień." }, { status: 500 });
  }
}
