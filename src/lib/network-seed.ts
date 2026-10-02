// Semilla del orden aleatorio de /barberias. La crea `proxy.ts` una vez por
// sesión del navegador (cookie sin vencimiento) para que el orden sea estable
// al paginar. No identifica a nadie y no se usa para otra cosa.
export const NETWORK_SEED_COOKIE = "bf_network_seed";
const SEED_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isNetworkSeed(value: string | undefined): value is string {
  return typeof value === "string" && SEED_PATTERN.test(value);
}
