import { isUuid } from "./uuid";

// Mismos límites que `public.register_visit`.
export const VISIT_MAX_SERVICES = 20;
export const VISIT_MAX_QUANTITY = 99;

// Campos del formulario: `quantity:<serviceId>` por servicio, `attendedBy`,
// `reward` y `idempotencyKey`.
export const QUANTITY_FIELD_PREFIX = "quantity:";

// Elección del premio:
// - `apply_now` / `later`: la visita completa el ciclo (elección obligatoria).
// - `pending:<id>`: aplicar un premio pendiente.
// - `none`: no aplicar premios.
export type RewardChoice =
  | { kind: "apply_now" }
  | { kind: "later" }
  | { kind: "pending"; rewardId: string }
  | { kind: "none" };

export type VisitRequest = {
  items: Array<{ service_id: string; quantity: number }>;
  attendedBy: string | null;
  reward: RewardChoice;
  idempotencyKey: string;
};

export function parseRewardChoice(value: string): RewardChoice | null {
  if (value === "apply_now" || value === "later" || value === "none") return { kind: value };
  if (value.startsWith("pending:")) {
    const rewardId = value.slice("pending:".length);
    return isUuid(rewardId) ? { kind: "pending", rewardId } : null;
  }
  return null;
}

export function validateVisitRequest(
  entries: Iterable<[string, FormDataEntryValue]>,
  { rewardDecisionRequired }: { rewardDecisionRequired: boolean },
): { ok: true; data: VisitRequest } | { ok: false; error: string } {
  const items: VisitRequest["items"] = [];
  let attendedBy: string | null = null;
  let reward: RewardChoice | null = { kind: "none" };
  let idempotencyKey = "";

  for (const [name, value] of entries) {
    if (typeof value !== "string") continue;
    if (name.startsWith(QUANTITY_FIELD_PREFIX)) {
      const serviceId = name.slice(QUANTITY_FIELD_PREFIX.length);
      const text = value.trim();
      if (text === "" || text === "0") continue;
      if (!isUuid(serviceId) || !/^\d{1,2}$/.test(text) || Number(text) < 1 || Number(text) > VISIT_MAX_QUANTITY) {
        return { ok: false, error: `Las cantidades deben ser números enteros entre 1 y ${VISIT_MAX_QUANTITY}.` };
      }
      items.push({ service_id: serviceId.toLowerCase(), quantity: Number(text) });
    } else if (name === "attendedBy") {
      if (value !== "" && !isUuid(value)) return { ok: false, error: "Elige quién atendió al cliente." };
      attendedBy = value === "" ? null : value;
    } else if (name === "reward") {
      reward = parseRewardChoice(value);
    } else if (name === "idempotencyKey") {
      idempotencyKey = value;
    }
  }

  if (items.length === 0) return { ok: false, error: "Elige al menos un servicio." };
  if (items.length > VISIT_MAX_SERVICES) return { ok: false, error: `Elige hasta ${VISIT_MAX_SERVICES} servicios.` };
  if (new Set(items.map((item) => item.service_id)).size !== items.length) {
    return { ok: false, error: "Hay servicios repetidos. Recarga la página." };
  }
  if (!reward) return { ok: false, error: "Elige qué hacer con el premio." };
  if (rewardDecisionRequired && reward.kind !== "apply_now" && reward.kind !== "later") {
    return { ok: false, error: "Indica si el premio se aplica en esta visita o después." };
  }
  if (!isUuid(idempotencyKey)) return { ok: false, error: "Recarga la página e inténtalo de nuevo." };

  return { ok: true, data: { items, attendedBy, reward, idempotencyKey } };
}
