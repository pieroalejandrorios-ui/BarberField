import type { Json } from "@/lib/supabase/database.types";

// Valida el JSON de `get_my_visits` (solo agregados por barbería).

export type MyVisitsStatus = "disabled" | "unverified" | "ok";

export type MyVisitsItem = {
  barbershopName: string;
  slug: string | null;
  district: string | null;
  totalVisits: number;
  progress: number | null;
  visitsRequired: number | null;
  visitsRemaining: number | null;
  programPaused: boolean;
  availableRewards: number;
};

export type MyVisits = { status: MyVisitsStatus; items: MyVisitsItem[] };

type JsonObject = { [key: string]: Json | undefined };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function int(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function text(value: Json | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseMyVisits(data: Json): MyVisits | null {
  if (!isObject(data)) return null;
  const status = data.status;
  if (status !== "disabled" && status !== "unverified" && status !== "ok") return null;
  const items = Array.isArray(data.items) ? data.items.filter(isObject) : [];

  return {
    status,
    items: items.flatMap((item) => {
      const barbershopName = text(item.barbershop_name);
      if (!barbershopName) return [];
      return [{
        barbershopName,
        slug: text(item.slug),
        district: text(item.district),
        totalVisits: int(item.total_visits) ?? 0,
        progress: int(item.progress),
        visitsRequired: int(item.visits_required),
        visitsRemaining: int(item.visits_remaining),
        programPaused: item.program_status === "paused",
        availableRewards: int(item.available_rewards) ?? 0,
      }];
    }),
  };
}
