import { validateSlug } from "./slug";

// Mismas reglas que `create_business` y los CHECK de la base de datos.
export const BUSINESS_NAME_MAX_LENGTH = 120;
export const ADDRESS_MAX_LENGTH = 200;

export type BusinessInput = { name: string; address: string; slug: string };
export type BusinessErrors = Partial<Record<keyof BusinessInput, string>>;

export function normalizeBusinessInput(input: BusinessInput): BusinessInput {
  return { name: input.name.trim(), address: input.address.trim(), slug: input.slug.trim() };
}

export function validateBusiness(input: BusinessInput): BusinessErrors {
  const errors: BusinessErrors = {};

  if (input.name.length === 0) errors.name = "Escribe el nombre de la barbería.";
  else if (input.name.length > BUSINESS_NAME_MAX_LENGTH)
    errors.name = `El nombre puede tener hasta ${BUSINESS_NAME_MAX_LENGTH} caracteres.`;

  if (input.address.length === 0) errors.address = "Escribe la dirección.";
  else if (input.address.length > ADDRESS_MAX_LENGTH)
    errors.address = `La dirección puede tener hasta ${ADDRESS_MAX_LENGTH} caracteres.`;

  const slugError = validateSlug(input.slug);
  if (slugError) errors.slug = slugError;

  return errors;
}
