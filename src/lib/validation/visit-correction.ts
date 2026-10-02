import { isUuid } from "./uuid";
import { QUANTITY_FIELD_PREFIX, VISIT_MAX_QUANTITY, VISIT_MAX_SERVICES } from "./visit";

export function validateVisitReason(value: unknown): string | null {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 300
    ? value.trim() : null;
}

export function validateVisitCorrection(formData: FormData) {
  const reason = validateVisitReason(formData.get("reason"));
  if (!reason) return { ok: false as const, error: "Escribe un motivo de entre 1 y 300 caracteres." };
  const attendedBy = formData.get("attendedBy");
  if (!isUuid(attendedBy)) return { ok: false as const, error: "Elige un miembro activo que atendió." };
  const items: Array<{ service_id: string; quantity: number }> = [];
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith(QUANTITY_FIELD_PREFIX)) continue;
    if (value === "" || value === "0") continue;
    const serviceId = name.slice(QUANTITY_FIELD_PREFIX.length);
    if (!isUuid(serviceId) || typeof value !== "string" || !/^[1-9][0-9]?$/.test(value) || Number(value) > VISIT_MAX_QUANTITY) {
      return { ok: false as const, error: "Revisa los servicios y sus cantidades (1 a 99)." };
    }
    items.push({ service_id: serviceId.toLowerCase(), quantity: Number(value) });
  }
  if (!items.length || items.length > VISIT_MAX_SERVICES || new Set(items.map(i => i.service_id)).size !== items.length) {
    return { ok: false as const, error: "Elige de 1 a 20 servicios sin repetir." };
  }
  return { ok: true as const, data: { items, attendedBy, reason } };
}
