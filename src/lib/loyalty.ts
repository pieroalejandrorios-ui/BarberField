import type { Json } from "@/lib/supabase/database.types";
import { formatPEN } from "@/lib/money";
import { isRewardType, type RewardType } from "@/lib/validation/loyalty";

// Términos de un premio (de la promoción, de un ciclo o de un premio emitido).
// Montos como texto decimal, tal como los devuelve la base de datos.
export type RewardTerms = {
  type: RewardType;
  serviceId: string | null;
  serviceName: string | null;
  percent: string | null;
  amount: string | null;
  description: string | null;
  publicText: string | null;
};

export type PendingReward = RewardTerms & { id: string; issuedAt: string };

export type CustomerLoyalty = {
  configured: boolean;
  programStatus: "active" | "paused" | null;
  progress: number;
  visitsRequired: number | null;
  nextVisitCompletes: boolean;
  reward: RewardTerms | null;
  availableRewards: PendingReward[];
  lastVisit: { id: string; visitedAt: string; customerSeq: number; total: string } | null;
};

type JsonObject = { [key: string]: Json | undefined };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function parseTerms(value: Json | undefined): RewardTerms | null {
  if (!isObject(value) || !isRewardType(value.type)) return null;
  return {
    type: value.type,
    serviceId: text(value.service_id),
    serviceName: text(value.service_name),
    percent: text(value.percent),
    amount: text(value.amount),
    description: text(value.description),
    publicText: text(value.public_text),
  };
}

// Valida la forma del JSON de `get_customer_loyalty` en vez de asumirla.
export function parseCustomerLoyalty(data: Json): CustomerLoyalty | null {
  if (!isObject(data) || typeof data.configured !== "boolean") return null;

  const status = data.program_status;
  const lastVisit = data.last_visit;

  return {
    configured: data.configured,
    programStatus: status === "active" || status === "paused" ? status : null,
    progress: typeof data.progress === "number" ? data.progress : 0,
    visitsRequired: typeof data.visits_required === "number" ? data.visits_required : null,
    nextVisitCompletes: data.next_visit_completes === true,
    reward: parseTerms(data.reward),
    availableRewards: (Array.isArray(data.available_rewards) ? data.available_rewards : []).flatMap((item) => {
      const terms = parseTerms(item);
      if (!terms || !isObject(item)) return [];
      const id = text(item.id);
      const issuedAt = text(item.issued_at);
      return id && issuedAt ? [{ ...terms, id, issuedAt }] : [];
    }),
    lastVisit:
      isObject(lastVisit) &&
      typeof lastVisit.id === "string" &&
      typeof lastVisit.visited_at === "string" &&
      typeof lastVisit.customer_seq === "number" &&
      typeof lastVisit.total === "string"
        ? { id: lastVisit.id, visitedAt: lastVisit.visited_at, customerSeq: lastVisit.customer_seq, total: lastVisit.total }
        : null,
  };
}

function formatPercent(value: string): string {
  return `${value.replace(/\.?0+$/, "")} %`;
}

// «Corte clásico gratis», «15 % de descuento», «S/ 10.00 de descuento» o el
// beneficio escrito por el dueño.
export function describeReward(terms: Pick<RewardTerms, "type" | "serviceName" | "percent" | "amount" | "description">): string {
  switch (terms.type) {
    case "free_service":
      return `${terms.serviceName ?? "Servicio"} gratis`;
    case "percent_discount":
      return `${formatPercent(terms.percent ?? "0")} de descuento`;
    case "fixed_discount":
      return `${formatPEN(terms.amount ?? "0")} de descuento`;
    case "custom_benefit":
      return terms.description ?? "Beneficio especial";
  }
}
