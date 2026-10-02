import "server-only";

import { parseCustomerLoyalty, type CustomerLoyalty } from "@/lib/loyalty";
import { requireUser } from "@/lib/session";

// Progreso y premios del cliente desde `get_customer_loyalty` (la función
// verifica la membresía). Lanza si falla, para que la página muestre el error.
export async function getCustomerLoyalty(customerId: string): Promise<CustomerLoyalty> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("get_customer_loyalty", { p_customer_id: customerId });
  const loyalty = error ? null : parseCustomerLoyalty(data);
  if (!loyalty) throw new Error("No se pudo cargar el progreso del cliente.");
  return loyalty;
}
