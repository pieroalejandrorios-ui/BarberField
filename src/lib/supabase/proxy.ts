import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";

export async function updateSession(request: NextRequest) {
  const { url, key } = getSupabaseConfig();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const nextResponse = NextResponse.next({ request });
        // Conservar cookies y cabeceras si la librería escribe varias veces.
        response.cookies.getAll().forEach((cookie) => nextResponse.cookies.set(cookie));
        for (const name of ["cache-control", "expires", "pragma"]) {
          const value = response.headers.get(name);
          if (value) nextResponse.headers.set(name, value);
        }
        cookiesToSet.forEach(({ name, value, options }) => {
          nextResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          nextResponse.headers.set(name, value);
        });
        response = nextResponse;
      },
    },
  });

  let isAuthenticated = false;
  try {
    // Esta llamada verifica el token y activa la renovación de la sesión.
    const { data, error } = await supabase.auth.getClaims();
    if (error) console.error("No se pudo validar la sesión de Supabase.");
    isAuthenticated = Boolean(data?.claims.sub);
  } catch {
    console.error("No se pudo contactar con Supabase para validar la sesión.");
  }

  // Esto renueva cookies, no autoriza operaciones: cada acción requiere Auth y RLS.
  return { response, isAuthenticated };
}

// Redirige conservando las cookies de sesión que se acaban de renovar.
export function redirectWithSession(request: NextRequest, response: NextResponse, pathname: string) {
  const redirect = NextResponse.redirect(new URL(pathname, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  for (const name of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(name);
    if (value) redirect.headers.set(name, value);
  }
  return redirect;
}
