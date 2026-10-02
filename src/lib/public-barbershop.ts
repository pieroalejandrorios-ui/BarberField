import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { isSocialPlatform, type SocialPlatform } from "@/lib/validation/page";

export type PublicBarbershop = {
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  mapsUrl: string | null;
  phone: string | null;
  hoursNote: string | null;
  logoPath: string | null;
  coverPath: string | null;
  hours: Array<{ weekday: number; opensAt: string; closesAt: string }>;
  socialLinks: Array<{ platform: SocialPlatform; url: string }>;
  photos: Array<{ path: string; caption: string | null }>;
  // `price` es texto decimal («25.50»), tal como lo devuelve la base de datos.
  services: Array<{ name: string; description: string | null; price: string; durationMinutes: number | null }>;
  // Texto público del premio, solo si la promoción está activa.
  loyaltyText: string | null;
};

type JsonObject = { [key: string]: Json | undefined };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function list(value: Json | undefined): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

// Valida la forma del JSON de `get_public_barbershop` en vez de asumirla.
export function parsePublicBarbershop(data: Json): PublicBarbershop | null {
  if (!isObject(data)) return null;
  const name = text(data.name);
  const slug = text(data.slug);
  if (!name || !slug) return null;

  return {
    name,
    slug,
    description: text(data.description),
    address: text(data.address),
    district: text(data.district),
    city: text(data.city),
    mapsUrl: text(data.maps_url),
    phone: text(data.phone),
    hoursNote: text(data.hours_note),
    logoPath: text(data.logo_path),
    coverPath: text(data.cover_path),
    hours: list(data.hours).flatMap((h) => {
      const opensAt = text(h.opens_at);
      const closesAt = text(h.closes_at);
      return typeof h.weekday === "number" && opensAt && closesAt ? [{ weekday: h.weekday, opensAt, closesAt }] : [];
    }),
    socialLinks: list(data.social_links).flatMap((l) => {
      const url = text(l.url);
      return isSocialPlatform(l.platform) && url ? [{ platform: l.platform, url }] : [];
    }),
    photos: list(data.photos).flatMap((p) => {
      const path = text(p.path);
      return path ? [{ path, caption: text(p.caption) }] : [];
    }),
    services: list(data.services).flatMap((s) => {
      const serviceName = text(s.name);
      const price = text(s.price);
      return serviceName && price
        ? [{
            name: serviceName,
            description: text(s.description),
            price,
            durationMinutes: typeof s.duration_minutes === "number" ? s.duration_minutes : null,
          }]
        : [];
    }),
    loyaltyText: text(data.loyalty_text),
  };
}

// `cache` comparte la consulta entre `generateMetadata` y la página.
export const getPublicBarbershop = cache(async (slug: string): Promise<PublicBarbershop | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_barbershop", { p_slug: slug });
  if (error) throw new Error("No se pudo cargar la página de la barbería.");
  return parsePublicBarbershop(data);
});
