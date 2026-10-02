// PostgreSQL recibe el desplazamiento como integer (32 bits).
export function parsePageNumber(value: string, pageSize: number): number {
  if (!/^\d+$/.test(value)) return 1;
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * pageSize > 2147483647) return 1;
  return page;
}
