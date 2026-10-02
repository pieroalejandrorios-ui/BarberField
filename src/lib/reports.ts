import type { Json } from "@/lib/supabase/database.types";

// Resultados de `get_business_report` y `list_report_visits`. Los importes
// llegan como texto decimal calculado en PostgreSQL; aquí solo se validan.

export type ReportAmounts = {
  visits: number;
  serviceUnits: number;
  subtotal: string;
  discountTotal: string;
  total: string;
};

export type ReportMember = ReportAmounts & {
  userId: string;
  email: string | null;
  role: "owner" | "barber";
  isActive: boolean;
};

export type BusinessReport = { totals: ReportAmounts; members: ReportMember[] };

export type ReportVisitItem = { serviceName: string; unitPrice: string; quantity: number; net: string; discount: string };

type JsonObject = { [key: string]: Json | undefined };

const DECIMAL = /^\d+\.\d{2}$/;

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decimal(value: Json | undefined): string | null {
  return typeof value === "string" && DECIMAL.test(value) ? value : null;
}

function count(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parseAmounts(value: Json | undefined): ReportAmounts | null {
  if (!isObject(value)) return null;
  const visits = count(value.visits);
  const serviceUnits = count(value.service_units);
  const subtotal = decimal(value.subtotal);
  const discountTotal = decimal(value.discount_total);
  const total = decimal(value.total);
  if (visits === null || serviceUnits === null || !subtotal || !discountTotal || !total) return null;
  return { visits, serviceUnits, subtotal, discountTotal, total };
}

export function parseBusinessReport(data: Json): BusinessReport | null {
  if (!isObject(data)) return null;
  const totals = parseAmounts(data.totals);
  if (!totals || !Array.isArray(data.members)) return null;
  const members = data.members.flatMap((item): ReportMember[] => {
    const amounts = parseAmounts(item);
    if (!amounts || !isObject(item) || typeof item.user_id !== "string") return [];
    if (item.role !== "owner" && item.role !== "barber") return [];
    return [{
      ...amounts,
      userId: item.user_id,
      email: typeof item.email === "string" ? item.email : null,
      role: item.role,
      isActive: item.is_active === true,
    }];
  });
  return members.length === data.members.length ? { totals, members } : null;
}

export function parseReportItems(data: Json): ReportVisitItem[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item): ReportVisitItem[] => {
    if (!isObject(item) || typeof item.service_name !== "string") return [];
    const unitPrice = decimal(item.unit_price);
    const net = decimal(item.net);
    const discount = decimal(item.discount);
    const quantity = count(item.quantity);
    return unitPrice && net && discount && quantity ? [{ serviceName: item.service_name, unitPrice, quantity, net, discount }] : [];
  });
}
