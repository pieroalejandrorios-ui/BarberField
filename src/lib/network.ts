import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { HoursRange } from "@/lib/opening-hours";

// Red pública de barberías: solo datos de tarjeta de locales que cumplen los
// requisitos (los calcula la base de datos).

export const NETWORK_PAGE_SIZE = 24;
export const NETWORK_ROW_SIZE = 12;
export const NETWORK_QUERY_MAX_LENGTH = 80;

export type NetworkCard = {
  slug: string;
  name: string;
  description: string | null;
  district: string | null;
  city: string | null;
  logoPath: string | null;
  hours: HoursRange[];
};

export type NetworkPage = { cards: NetworkCard[]; total: number };

export type NetworkQuery = {
  seed: string;
  query?: string;
  district?: string | null;
  sort?: "random" | "newest";
  limit?: number;
  offset?: number;
};

function parseHours(value: Json): HoursRange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const { weekday, opens_at: opensAt, closes_at: closesAt } = item;
    return typeof weekday === "number" && typeof opensAt === "string" && typeof closesAt === "string"
      ? [{ weekday, opensAt, closesAt }]
      : [];
  });
}

export async function listNetworkBarbershops(params: NetworkQuery): Promise<NetworkPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_network_barbershops", {
    p_seed: params.seed,
    p_query: params.query ?? "",
    p_district: params.district ?? null,
    p_sort: params.sort ?? "random",
    p_limit: params.limit ?? NETWORK_PAGE_SIZE,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error("No se pudieron cargar las barberías.");

  return {
    cards: data.map((row) => ({
      slug: row.slug,
      name: row.name,
      description: row.description,
      district: row.district,
      city: row.city,
      logoPath: row.logo_path,
      hours: parseHours(row.hours),
    })),
    total: Number(data[0]?.total_count ?? 0),
  };
}

export async function listNetworkDistricts(limit = 6): Promise<Array<{ district: string; count: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_network_districts", { p_limit: limit });
  if (error) throw new Error("No se pudieron cargar los distritos.");
  return data.map((row) => ({ district: row.district, count: Number(row.barbershop_count) }));
}

// Slug actual de un local publicado a partir de uno anterior, o null.
export async function resolveBarbershopSlug(slug: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_barbershop_slug", { p_slug: slug });
  if (error) throw new Error("No se pudo cargar la página de la barbería.");
  return typeof data === "string" && data.length > 0 ? data : null;
}
