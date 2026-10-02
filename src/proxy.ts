import type { NextRequest } from "next/server";
import { redirectWithSession, updateSession } from "@/lib/supabase/proxy";

const AUTH_PAGES = new Set(["/login", "/registro"]);

function isPanelPath(pathname: string): boolean {
  return pathname === "/panel" || pathname.startsWith("/panel/");
}

// Comprobación optimista: cada página y Server Action del panel vuelve a
// verificar la sesión y la membresía, y RLS protege los datos.
export async function proxy(request: NextRequest) {
  const { response, isAuthenticated } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!isAuthenticated && isPanelPath(pathname)) {
    return redirectWithSession(request, response, "/login");
  }
  if (isAuthenticated && AUTH_PAGES.has(pathname)) {
    return redirectWithSession(request, response, "/panel");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
