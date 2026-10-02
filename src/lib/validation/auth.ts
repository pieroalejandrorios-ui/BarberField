export const PASSWORD_MIN_LENGTH = 8;
// Supabase Auth (bcrypt) solo usa los primeros 72 bytes.
export const PASSWORD_MAX_LENGTH = 72;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  if (email.length === 0) return "Escribe tu correo.";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return "Escribe un correo válido.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH)
    return "La contraseña es demasiado larga.";
  return null;
}
