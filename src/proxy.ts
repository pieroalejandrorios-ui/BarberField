import type { NextRequest } from "next/server";
import { HOME_PATH } from "@/lib/home";
import { NETWORK_SEED_COOKIE, isNetworkSeed } from "@/lib/network-seed";
import { redirectWithSession, updateSession } from "@/lib/supabase/proxy";

// Con sesión, la landing y las pantallas de acceso llevan al inicio (la red).
const SIGNED_IN_REDIRECTS = new Set(["/", "/login", "/registro"]);

function isProtectedPath(pathname: string): boolean {
  return pathname === "/panel" || pathname.startsWith("/panel/") || pathname === "/aceptar-terminos";
}

// Comprobación optimista: cada página y Server Action del panel vuelve a
// verificar la sesión y la membresía, y RLS protege los datos.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Semilla del orden aleatorio de /barberias, estable durante la sesión del
  // navegador. Se añade también a la solicitud para que la página la lea en la
  // primera visita.
  let newSeed: string | null = null;
  if (pathname === "/barberias" && !isNetworkSeed(request.cookies.get(NETWORK_SEED_COOKIE)?.value)) {
    newSeed = crypto.randomUUID();
    request.cookies.set(NETWORK_SEED_COOKIE, newSeed);
  }

  const { response, isAuthenticated } = await updateSession(request);

  if (!isAuthenticated && isProtectedPath(pathname)) {
    return redirectWithSession(request, response, "/login");
  }
  if (isAuthenticated && SIGNED_IN_REDIRECTS.has(pathname)) {
    return redirectWithSession(request, response, HOME_PATH);
  }
  if (newSeed) {
    response.cookies.set(NETWORK_SEED_COOKIE, newSeed, {
      path: "/barberias",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
