import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

try {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Completa la URL y la clave pública de Supabase en .env.local.");
  }

  const endpoint = new URL("auth/v1/settings", `${url.replace(/\/$/, "")}/`);
  const response = await fetch(endpoint, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Supabase respondió con HTTP ${response.status}. Revisa la URL y la clave pública.`);
  }

  const settings = await response.json();
  if (!settings || typeof settings.external !== "object") {
    throw new Error("La respuesta no corresponde al servicio de autenticación de Supabase.");
  }

  console.log("Conexión con Supabase correcta. El servicio de autenticación responde; las tablas y sus permisos todavía deben verificarse por separado.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "No se pudo comprobar la conexión.");
  process.exitCode = 1;
}
