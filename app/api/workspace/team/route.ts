import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { hashPassword, validatePassword } from "@/lib/server/passwords";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roles = new Set(["admin", "accountant", "employee", "viewer"]);

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  const canManageTeam = session?.platformRole === "supervisor" || session?.membershipRole === "owner" || session?.membershipRole === "admin";
  if (!session?.tenantId || !canManageTeam) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const role = typeof body?.role === "string" ? body.role : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!emailPattern.test(email) || email.length > 254 || fullName.length < 2 || fullName.length > 120 || !roles.has(role)) {
    return NextResponse.json({ error: "Uzupełnij prawidłowe dane pracownika." }, { status: 400 });
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  try {
    const userId = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      const result = await client.query<{ epito_create_tenant_user: string }>(
        "select epito_create_tenant_user($1, $2, $3, $4)",
        [email, fullName, role, passwordHash],
      );
      return result.rows[0].epito_create_tenant_user;
    });
    return NextResponse.json({ ok: true, userId }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "23505") {
      return NextResponse.json({ error: "Użytkownik z tym e-mailem już istnieje." }, { status: 409 });
    }
    console.error("Team member creation failed", error);
    return NextResponse.json({ error: "Nie udało się dodać pracownika." }, { status: 500 });
  }
}
