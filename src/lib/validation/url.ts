export const URL_MAX_LENGTH = 300;
export const MAPS_URL_MAX_LENGTH = 500;

// Mismo patrón que el CHECK `barbershops_maps_url_format`.
const MAPS_URL_PATTERN =
  /^https:\/\/((www\.)?google\.com\/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl\/maps)([/?#].*)?$/;

export function isHttpsUrl(value: string, maxLength = URL_MAX_LENGTH): boolean {
  if (value.length > maxLength || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function isGoogleMapsUrl(value: string): boolean {
  return isHttpsUrl(value, MAPS_URL_MAX_LENGTH) && MAPS_URL_PATTERN.test(value);
}
