// Vista previa del total en el formulario de visita, en céntimos enteros para
// no arrastrar errores de punto flotante. Solo se muestra: el total oficial lo
// calcula `register_visit` con las mismas reglas.
// Sin importaciones para poder probarlo con `node --test`.

export type PreviewReward =
  | { type: "free_service"; serviceId: string | null }
  | { type: "percent_discount"; percent: string | null }
  | { type: "fixed_discount"; amount: string | null }
  | { type: "custom_benefit" };

export type PreviewLine = { serviceId: string; price: string; quantity: number };

export type VisitPreview = {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  // Monto fijo mayor al subtotal: el sobrante se pierde.
  lostCents: number;
  // free_service sin ese servicio en la visita: el sistema rechazará el canje.
  missingRewardService: boolean;
};

// «25.50» → 2550. Acepta los textos decimales que devuelve la base de datos.
export function toCents(amount: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) return 0;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export function centsToAmount(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function previewVisit(lines: PreviewLine[], reward: PreviewReward | null): VisitPreview {
  const chosen = lines.filter((line) => line.quantity > 0);
  const subtotalCents = chosen.reduce((sum, line) => sum + toCents(line.price) * line.quantity, 0);
  let discountCents = 0;
  let lostCents = 0;
  let missingRewardService = false;

  if (reward) {
    switch (reward.type) {
      case "free_service": {
        const line = chosen.find((l) => l.serviceId === reward.serviceId);
        if (line) discountCents = toCents(line.price);
        else missingRewardService = true;
        break;
      }
      case "percent_discount":
        // Redondeo a 2 decimales, con la mitad hacia arriba (como `round` en Postgres).
        discountCents = Math.floor((subtotalCents * toCents(reward.percent ?? "0") + 5000) / 10000);
        break;
      case "fixed_discount": {
        const amountCents = toCents(reward.amount ?? "0");
        discountCents = Math.min(amountCents, subtotalCents);
        lostCents = amountCents - discountCents;
        break;
      }
      case "custom_benefit":
        break;
    }
  }

  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents, lostCents, missingRewardService };
}
