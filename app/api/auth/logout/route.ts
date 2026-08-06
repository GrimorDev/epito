import { NextRequest, NextResponse } from "next/server";
import { destroySession, isSameOrigin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  await destroySession(request, response);
  return response;
}
