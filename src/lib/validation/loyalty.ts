import { parseMoney } from "./money";
import { isUuid } from "./uuid";

// Mismas reglas que `public.save_loyalty_program` y los CHECK de `loyalty_programs`.
export const VISITS_REQUIRED_MIN = 1;
export const VISITS_REQUIRED_MAX = 50;
export const VISITS_REQUIRED_DEFAULT = 5;
export const REWARD_TEXT_MAX_LENGTH = 200;

export const REWARD_TYPES = [
  { type: "free_service", label: "Un servicio gratis" },
  { type: "percent_discount", label: "Porcentaje de descuento" },
  { type: "fixed_discount", label: "Monto fijo de descuento" },
  { type: "custom_benefit", label: "Beneficio especial" },
] as const;

export type RewardType = (typeof REWARD_TYPES)[number]["type"];

export function isRewardType(value: unknown): value is RewardType {
  return REWARD_TYPES.some((option) => option.type === value);
}

export type LoyaltyFormValues = {
  visitsRequired: string;
  rewardType: string;
  serviceId: string;
  percent: string;
  amount: string;
  description: string;
  publicText: string;
  isActive: boolean;
};

export type LoyaltyErrors = Partial<
  Record<"visitsRequired" | "rewardType" | "serviceId" | "percent" | "amount" | "description" | "publicText", string>
>;

export type LoyaltyData = {
  visitsRequired: number;
  rewardType: RewardType;
  serviceId: string | null;
  // Texto decimal normalizado («15.00», «10.50»).
  percent: string | null;
  amount: string | null;
  description: string | null;
  publicText: string | null;
  isActive: boolean;
};

const PERCENT_PATTERN = /^(\d{1,3})(?:[.,](\d{1,2}))?$/;

// «15», «12,5» o «12.50 %» → «12.50». Mayor que 0 y hasta 100.
export function parsePercent(input: string): { ok: true; value: string } | { ok: false; error: string } {
  const cleaned = input.trim().replace(/\s*%$/, "");
  const match = PERCENT_PATTERN.exec(cleaned);
  if (!match) return { ok: false, error: "Escribe un porcentaje, por ejemplo 10 o 12.5." };

  const integer = Number(match[1]);
  const cents = (match[2] ?? "").padEnd(2, "0");
  const hundredths = integer * 100 + Number(cents);
  if (hundredths <= 0 || hundredths > 10000) return { ok: false, error: "El porcentaje debe ser mayor que 0 y hasta 100." };
  return { ok: true, value: `${integer}.${cents}` };
}

export function validateLoyalty(
  values: LoyaltyFormValues,
): { ok: true; data: LoyaltyData } | { ok: false; errors: LoyaltyErrors } {
  const errors: LoyaltyErrors = {};
  const description = values.description.trim();
  const publicText = values.publicText.trim();

  const visitsText = values.visitsRequired.trim();
  const visitsRequired = Number(visitsText);
  if (!/^\d+$/.test(visitsText) || visitsRequired < VISITS_REQUIRED_MIN || visitsRequired > VISITS_REQUIRED_MAX) {
    errors.visitsRequired = `Escribe un número entero entre ${VISITS_REQUIRED_MIN} y ${VISITS_REQUIRED_MAX}.`;
  }

  if (publicText.length > REWARD_TEXT_MAX_LENGTH) {
    errors.publicText = `El texto puede tener hasta ${REWARD_TEXT_MAX_LENGTH} caracteres.`;
  }

  const rewardType = values.rewardType;
  if (!isRewardType(rewardType)) {
    errors.rewardType = "Elige el tipo de premio.";
    return { ok: false, errors };
  }

  let serviceId: string | null = null;
  let percent: string | null = null;
  let amount: string | null = null;
  let rewardDescription: string | null = null;

  switch (rewardType) {
    case "free_service":
      if (!isUuid(values.serviceId)) errors.serviceId = "Elige el servicio que será gratis.";
      else serviceId = values.serviceId;
      break;
    case "percent_discount": {
      const parsed = parsePercent(values.percent);
      if (!parsed.ok) errors.percent = parsed.error;
      else percent = parsed.value;
      break;
    }
    case "fixed_discount": {
      const parsed = parseMoney(values.amount);
      if (!parsed.ok) errors.amount = parsed.error.replace("precio", "monto");
      else if (Number(parsed.value) <= 0) errors.amount = "El monto debe ser mayor que 0.";
      else amount = parsed.value;
      break;
    }
    case "custom_benefit":
      if (description.length === 0) errors.description = "Describe el beneficio, por ejemplo «Lavado + mascarilla gratis».";
      else if (description.length > REWARD_TEXT_MAX_LENGTH)
        errors.description = `La descripción puede tener hasta ${REWARD_TEXT_MAX_LENGTH} caracteres.`;
      else rewardDescription = description;
      break;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      visitsRequired,
      rewardType,
      serviceId,
      percent,
      amount,
      description: rewardDescription,
      publicText: publicText.length > 0 ? publicText : null,
      isActive: values.isActive,
    },
  };
}
