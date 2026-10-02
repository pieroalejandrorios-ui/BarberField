import { ADDRESS_MAX_LENGTH, BUSINESS_NAME_MAX_LENGTH } from "./business";
import { normalizeContactPhone } from "./phone";
import { validateSlug } from "./slug";
import { isGoogleMapsUrl, isHttpsUrl } from "./url";

// Mismas reglas que los CHECK de `barbershops` y las tablas de la página.
export const DESCRIPTION_MAX_LENGTH = 1000;
export const PLACE_MAX_LENGTH = 80;
export const HOURS_NOTE_MAX_LENGTH = 200;
export const CAPTION_MAX_LENGTH = 120;

export type PageDetailsValues = {
  name: string;
  slug: string;
  description: string;
  address: string;
  district: string;
  city: string;
  phone: string;
  mapsUrl: string;
};

export type PageDetailsErrors = Partial<Record<keyof PageDetailsValues, string>>;

export type PageDetailsData = {
  name: string;
  slug: string;
  description: string | null;
  address: string;
  district: string | null;
  city: string | null;
  phone: string | null;
  mapsUrl: string | null;
};

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validatePageDetails(
  values: PageDetailsValues,
): { ok: true; data: PageDetailsData } | { ok: false; errors: PageDetailsErrors } {
  const errors: PageDetailsErrors = {};
  const name = values.name.trim();
  const slug = values.slug.trim();
  const address = values.address.trim();
  // Saltos de línea normalizados; el texto se muestra sin HTML.
  const description = optional(values.description.replace(/\r\n/g, "\n"));
  const district = optional(values.district);
  const city = optional(values.city);
  const rawPhone = optional(values.phone);
  const mapsUrl = optional(values.mapsUrl);

  if (name.length === 0) errors.name = "Escribe el nombre de la barbería.";
  else if (name.length > BUSINESS_NAME_MAX_LENGTH)
    errors.name = `El nombre puede tener hasta ${BUSINESS_NAME_MAX_LENGTH} caracteres.`;

  const slugError = validateSlug(slug);
  if (slugError) errors.slug = slugError;

  if (description && description.length > DESCRIPTION_MAX_LENGTH)
    errors.description = `La descripción puede tener hasta ${DESCRIPTION_MAX_LENGTH} caracteres.`;

  if (address.length === 0) errors.address = "Escribe la dirección.";
  else if (address.length > ADDRESS_MAX_LENGTH)
    errors.address = `La dirección puede tener hasta ${ADDRESS_MAX_LENGTH} caracteres.`;

  if (district && district.length > PLACE_MAX_LENGTH)
    errors.district = `Hasta ${PLACE_MAX_LENGTH} caracteres.`;
  if (city && city.length > PLACE_MAX_LENGTH) errors.city = `Hasta ${PLACE_MAX_LENGTH} caracteres.`;

  const phone = rawPhone ? normalizeContactPhone(rawPhone) : null;
  if (rawPhone && !phone)
    errors.phone = "Escribe un celular de 9 dígitos que empiece en 9, o un fijo con su código (01 4567890).";

  if (mapsUrl && !isGoogleMapsUrl(mapsUrl))
    errors.mapsUrl = "Pega el enlace de Google Maps (empieza con https://maps.app.goo.gl/ o https://www.google.com/maps).";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { name, slug, description, address, district, city, phone, mapsUrl } };
}

export const SOCIAL_PLATFORMS = [
  { platform: "instagram", label: "Instagram", placeholder: "https://instagram.com/tubarberia" },
  { platform: "facebook", label: "Facebook", placeholder: "https://facebook.com/tubarberia" },
  { platform: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@tubarberia" },
  { platform: "youtube", label: "YouTube", placeholder: "https://youtube.com/@tubarberia" },
  { platform: "x", label: "X", placeholder: "https://x.com/tubarberia" },
  { platform: "website", label: "Sitio web", placeholder: "https://tubarberia.pe" },
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["platform"];

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return SOCIAL_PLATFORMS.some((item) => item.platform === value);
}

export function validateSocialUrl(url: string): string | null {
  return isHttpsUrl(url) ? null : "Pega un enlace completo que empiece con https://";
}

export function validateCaption(caption: string): string | null {
  return caption.trim().length > CAPTION_MAX_LENGTH ? `La leyenda puede tener hasta ${CAPTION_MAX_LENGTH} caracteres.` : null;
}
