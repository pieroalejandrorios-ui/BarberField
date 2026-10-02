import { normalizeMobile } from "./phone";

// Mismas reglas que los CHECK de `public.customers`.
export const CUSTOMER_NAME_MAX_LENGTH = 120;
const DNI_PATTERN = /^\d{8}$/;

export type CustomerValues = { fullName: string; dni: string; phone: string };
export type CustomerErrors = Partial<Record<keyof CustomerValues | "consent", string>>;
export type CustomerData = { fullName: string; dni: string; phone: string };

// DNI como texto para conservar ceros iniciales; se aceptan espacios al escribir.
export function normalizeDni(input: string): string {
  return input.replace(/\s/g, "");
}

export function validateCustomer(
  values: CustomerValues,
): { ok: true; data: CustomerData } | { ok: false; errors: CustomerErrors } {
  const errors: CustomerErrors = {};
  const fullName = values.fullName.trim().replace(/\s+/g, " ");
  const dni = normalizeDni(values.dni);
  const phone = normalizeMobile(values.phone);

  if (fullName.length === 0) errors.fullName = "Escribe el nombre completo.";
  else if (fullName.length > CUSTOMER_NAME_MAX_LENGTH)
    errors.fullName = `El nombre puede tener hasta ${CUSTOMER_NAME_MAX_LENGTH} caracteres.`;

  if (dni.length === 0) errors.dni = "Escribe el DNI.";
  else if (!DNI_PATTERN.test(dni)) errors.dni = "El DNI debe tener exactamente 8 dígitos.";

  if (values.phone.trim().length === 0) errors.phone = "Escribe el celular.";
  else if (!phone) errors.phone = "Escribe un celular de 9 dígitos que empiece en 9.";

  if (!phone || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { fullName, dni, phone } };
}
