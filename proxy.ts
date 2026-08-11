import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveRequestHost, resolveTenantSlugFromHost } from "@/lib/server/auth";

// A tenant's portal subdomain (clientNNNN.epito.pl) should land the visitor
// on the login screen for their own organization, not the public marketing
// homepage — app/page.tsx is a "use client" component and can't make this
// call itself, so it's handled here before the page ever renders. Scoped to
// "/" only: everything else (auth guards on /workspace, /office, etc.)
// already handles its own redirect-when-unauthenticated logic.
export function proxy(request: NextRequest) {
  const hostSlug = resolveTenantSlugFromHost(resolveRequestHost(request));
  if (!hostSlug) return NextResponse.next();
  return NextResponse.redirect(new URL("/logowanie", request.url));
}

export const config = {
  matcher: "/",
};
