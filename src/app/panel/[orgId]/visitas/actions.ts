"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMemberBusiness, requireUser } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { isUuid } from "@/lib/validation/uuid";
import { validateVisitRequest } from "@/lib/validation/visit";

export type RegisterVisitState = {
  message?: string;
  // El progreso cambió (otro registro simultáneo): la interfaz debe recargarlo.
  stale?: boolean;
};

export async function registerVisit(
  organizationId: string,
  customerId: string,
  _prev: RegisterVisitState,
  formData: FormData,
): Promise<RegisterVisitState> {
  const business = await getMemberBusiness(organizationId);
  if (!business || !isUuid(customerId)) return { message: "No tienes permiso para registrar visitas aquí." };

  const parsed = validateVisitRequest(formData.entries(), {
    rewardDecisionRequired: formData.get("rewardDecisionRequired") === "1",
  });
  if (!parsed.ok) return { message: parsed.error };
  const { items, attendedBy, reward, idempotencyKey } = parsed.data;

  const { supabase } = await requireUser();

  // En la v1 cada negocio tiene un solo local activo.
  const { data: barbershop, error: barbershopError } = await supabase
    .from("barbershops")
    .select("id")
    .eq("organization_id", business.id)
    .is("archived_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (barbershopError) return { message: dbErrorMessage(barbershopError) };
  if (!barbershop) return { message: "Tu barbería no tiene un local activo." };

  const { data, error } = await supabase.rpc("register_visit", {
    p_barbershop_id: barbershop.id,
    p_customer_id: customerId,
    p_items: items,
    p_attended_by: attendedBy,
    p_apply_earned_reward: reward.kind === "apply_now",
    p_pending_reward_id: reward.kind === "pending" ? reward.rewardId : null,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    const stale = error.code === "PT013" || error.code === "PT014";
    return { message: dbErrorMessage(error, { "22023": "Revisa los servicios, cantidades y quién atendió." }), stale };
  }

  const visit = data[0];
  if (!visit) return { message: "No se pudo confirmar el registro. Revisa la ficha del cliente antes de reintentar." };

  revalidatePath(`/panel/${business.id}`, "layout");
  redirect(`/panel/${business.id}/clientes/${customerId}?visita=${visit.visit_id}`);
}
