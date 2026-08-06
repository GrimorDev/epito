import { NextRequest, NextResponse } from "next/server";
import { getSession, isProductionBackendEnabled } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isProductionBackendEnabled()) {
    return NextResponse.json({ authenticated: false, productionMode: false });
  }

  const session = await getSession(request);
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, session });
}
