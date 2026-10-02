const penFormatter = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

// Solo para mostrar. Los montos que se guardan los calcula la base de datos.
export function formatPEN(amount: number | string): string {
  return penFormatter.format(typeof amount === "string" ? Number(amount) : amount);
}

// PostgREST devuelve `numeric` como número JSON; esto lo muestra en un campo
// de formulario con dos decimales («25.5» → «25.50»).
export function moneyToInput(amount: number): string {
  return amount.toFixed(2);
}
