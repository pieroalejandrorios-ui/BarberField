export type DeploymentEnvironment = "development" | "preview" | "production";

export function deploymentEnvironment(env: Record<string, string | undefined>): DeploymentEnvironment {
  // Vercel decide el entorno de la ejecución; un override no convierte una preview en producción.
  const value = env.VERCEL_ENV ?? env.APP_ENV ?? "development";
  return value === "production" || value === "preview" ? value : "development";
}

function baseUrl(value: string | undefined): URL | null {
  try {
    const url = new URL(value ?? "");
    return !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url : null;
  } catch {
    return null;
  }
}

export function deploymentIssues(env: Record<string, string | undefined>, release = false): string[] {
  const issues: string[] = [];
  const environment = deploymentEnvironment(env);
  const allowed = new Set(["development", "preview", "production"]);
  if (env.APP_ENV && !allowed.has(env.APP_ENV)) issues.push("APP_ENV debe ser development, preview o production.");
  if (env.VERCEL_ENV && env.APP_ENV && env.VERCEL_ENV !== env.APP_ENV) issues.push("APP_ENV no coincide con el entorno de Vercel.");
  const supabase = baseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!supabase || supabase.protocol !== "https:") issues.push("NEXT_PUBLIC_SUPABASE_URL debe ser la URL base HTTPS de Supabase.");
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  let publicKey = /^sb_publishable_.+/.test(key);
  if (!publicKey && key.split(".").length === 3) {
    try {
      const payload: unknown = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      publicKey = typeof payload === "object" && payload !== null && "role" in payload && payload.role === "anon";
    } catch { /* Una clave inválida se reporta sin mostrarla. */ }
  }
  if (!publicKey) issues.push("La clave de Supabase debe ser publishable o anon. No uses secret ni service_role.");
  const app = baseUrl(env.NEXT_PUBLIC_APP_URL);
  const localApp = app?.hostname === "localhost" || app?.hostname === "127.0.0.1" || app?.hostname === "[::1]";
  if (env.NEXT_PUBLIC_APP_URL && (!app || (app.protocol !== "https:" && !(environment === "development" && localApp && app.protocol === "http:")))) {
    issues.push("NEXT_PUBLIC_APP_URL debe ser una URL base HTTPS (HTTP local solo en desarrollo).");
  }
  if (environment === "production" && (!app || app.protocol !== "https:" || localApp)) issues.push("Producción necesita NEXT_PUBLIC_APP_URL con su dominio HTTPS público.");
  const productionRef = env.SUPABASE_PRODUCTION_PROJECT_REF;
  if (productionRef && !/^[a-z0-9]{20}$/.test(productionRef)) issues.push("SUPABASE_PRODUCTION_PROJECT_REF debe ser el identificador del proyecto de producción.");
  if (productionRef && supabase) {
    const isProductionProject = supabase.hostname === `${productionRef}.supabase.co`;
    if (environment !== "production" && isProductionProject) issues.push("Desarrollo y Preview no deben conectarse al proyecto Supabase de producción.");
    if (environment === "production" && !isProductionProject) issues.push("La URL de Supabase no coincide con el proyecto declarado para producción.");
  }
  if (release && environment !== "production") issues.push("La comprobación de publicación requiere un entorno production.");
  if (release && !productionRef) issues.push("Declara SUPABASE_PRODUCTION_PROJECT_REF para comprobar el destino de producción.");
  return issues;
}
