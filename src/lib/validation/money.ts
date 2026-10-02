// Montos en PEN como texto decimal con 2 decimales, igual que `numeric(10,2)`.
// No se hacen cálculos con `number`: el texto normalizado es el valor oficial.
const MONEY_INPUT_PATTERN = /^(\d{1,8})(?:[.,](\d{1,2}))?$/;

export type MoneyResult = { ok: true; value: string } | { ok: false; error: string };

// Acepta «25», «25.5», «25,50» o «S/ 25.00»; devuelve «25.50».
export function parseMoney(input: string): MoneyResult {
  const cleaned = input.trim().replace(/^s\/\s*/i, "").replace(/\s+/g, "");
  if (cleaned.length === 0) return { ok: false, error: "Escribe el precio." };
  if (cleaned.startsWith("-")) return { ok: false, error: "El precio no puede ser negativo." };

  const match = MONEY_INPUT_PATTERN.exec(cleaned);
  if (!match) return { ok: false, error: "Escribe un precio válido, por ejemplo 25 o 25.50." };

  const integer = match[1].replace(/^0+(?=\d)/, "");
  const cents = (match[2] ?? "").padEnd(2, "0");
  return { ok: true, value: `${integer}.${cents}` };
}
