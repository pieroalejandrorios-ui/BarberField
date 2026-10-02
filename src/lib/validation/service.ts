import { parseMoney } from "./money";

// Mismas reglas que los CHECK de `public.services`.
export const SERVICE_NAME_MAX_LENGTH = 80;
export const SERVICE_DESCRIPTION_MAX_LENGTH = 300;
export const SERVICE_DURATION_MAX = 1440;

export type ServiceFormValues = {
  name: string;
  description: string;
  price: string;
  durationMinutes: string;
  isPublished: boolean;
};

export type ServiceErrors = Partial<Record<"name" | "description" | "price" | "durationMinutes", string>>;

export type ServiceData = {
  name: string;
  description: string | null;
  // Texto decimal normalizado («25.50»).
  price: string;
  durationMinutes: number | null;
  isPublished: boolean;
};

export function validateService(
  values: ServiceFormValues,
): { ok: true; data: ServiceData } | { ok: false; errors: ServiceErrors } {
  const errors: ServiceErrors = {};
  const name = values.name.trim();
  const description = values.description.trim();

  if (name.length === 0) errors.name = "Escribe el nombre del servicio.";
  else if (name.length > SERVICE_NAME_MAX_LENGTH)
    errors.name = `El nombre puede tener hasta ${SERVICE_NAME_MAX_LENGTH} caracteres.`;

  if (description.length > SERVICE_DESCRIPTION_MAX_LENGTH)
    errors.description = `La descripción puede tener hasta ${SERVICE_DESCRIPTION_MAX_LENGTH} caracteres.`;

  const price = parseMoney(values.price);
  if (!price.ok) errors.price = price.error;

  let durationMinutes: number | null = null;
  const rawDuration = values.durationMinutes.trim();
  if (rawDuration.length > 0) {
    if (!/^\d+$/.test(rawDuration) || Number(rawDuration) < 1 || Number(rawDuration) > SERVICE_DURATION_MAX) {
      errors.durationMinutes = `Escribe los minutos como número entero entre 1 y ${SERVICE_DURATION_MAX}, o déjalo vacío.`;
    } else {
      durationMinutes = Number(rawDuration);
    }
  }

  if (!price.ok || Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      description: description.length > 0 ? description : null,
      price: price.value,
      durationMinutes,
      isPublished: values.isPublished,
    },
  };
}
