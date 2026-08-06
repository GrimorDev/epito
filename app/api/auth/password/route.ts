import { NextRequest, NextResponse } from "next/server";
import { findLoginIdentity } from "@/lib/server/accounts";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withUserTransaction } from "@/lib/server/database";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/server/passwords";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Zaloguj się ponownie." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const validationError = validatePassword(newPassword);
  if (!currentPassword || validationError) {
    return NextResponse.json({ error: validationError || "Podaj obecne hasło." }, { status: 400 });
  }

  const identity = await findLoginIdentity(session.email);
  if (!identity || identity.userId !== session.userId || !(await verifyPassword(currentPassword, identity.passwordHash))) {
    return NextResponse.json({ error: "Obecne hasło jest nieprawidłowe." }, { status: 401 });
  }

  const passwordHash = await hashPassword(newPassword);
  await withUserTransaction(session.userId, (client) =>
    client.query(
      "update user_credentials set password_hash = $1, password_changed_at = now(), updated_at = now() where user_id = $2",
      [passwordHash, session.userId],
    ).then(() => undefined),
  );
  return NextResponse.json({ ok: true });
}
