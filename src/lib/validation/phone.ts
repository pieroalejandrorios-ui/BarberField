// Teléfonos peruanos normalizados a E.164 (+51…), igual que los CHECK.

function digitsWithoutPrefix(input: string): string | null {
  const compact = input.trim().replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;
  if (compact.startsWith("+51")) return compact.slice(3);
  if (compact.startsWith("+")) return null;
  // Prefijo de larga distancia nacional («01 4567890», «044 123456»).
  if (compact.startsWith("0")) return compact.slice(1);
  return compact;
}

// Celular: 9 dígitos que empiezan en 9 → «+519XXXXXXXX».
export function normalizeMobile(input: string): string | null {
  const digits = digitsWithoutPrefix(input);
  return digits && /^9\d{8}$/.test(digits) ? `+51${digits}` : null;
}

// Celular o fijo con código de área: Lima «1» + 7 dígitos, provincias código
// de 2 + 6 dígitos (8 en total). El CHECK de la base es más amplio.
export function normalizeContactPhone(input: string): string | null {
  const digits = digitsWithoutPrefix(input);
  if (!digits) return null;
  return /^(9\d{8}|[1-8]\d{7})$/.test(digits) ? `+51${digits}` : null;
}

export function isMobile(phone: string): boolean {
  return /^\+519\d{8}$/.test(phone);
}

// «+51987654321» → «987 654 321»; fijos se muestran con su código de área.
export function formatPhone(phone: string): string {
  const digits = phone.replace(/^\+51/, "");
  if (/^9\d{8}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  if (digits.startsWith("1")) return `(01) ${digits.slice(1)}`;
  return `(0${digits.slice(0, 2)}) ${digits.slice(2)}`;
}
