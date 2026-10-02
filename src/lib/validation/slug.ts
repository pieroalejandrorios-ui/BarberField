// Mismas reglas que el CHECK `barbershops_slug_format` y `create_business`.
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 60;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Propone un slug a partir del nombre: «Barbería Ñaña» → «barberia-nana».
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
}

export function validateSlug(slug: string): string | null {
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return `El enlace debe tener entre ${SLUG_MIN_LENGTH} y ${SLUG_MAX_LENGTH} caracteres.`;
  }
  if (!SLUG_PATTERN.test(slug)) {
    return "Usa solo letras minúsculas sin tildes, números y guiones entre palabras.";
  }
  return null;
}
