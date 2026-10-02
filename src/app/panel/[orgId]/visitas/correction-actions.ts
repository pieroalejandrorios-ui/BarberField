"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMemberBusiness, requireUser } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { isUuid } from "@/lib/validation/uuid";
import { validateVisitCorrection, validateVisitReason } from "@/lib/validation/visit-correction";

export type VisitChangeState = { message?: string };

export async function changeVisit(orgId: string, visitId: string, operation: "correct" | "void",
  _previous: VisitChangeState, formData: FormData): Promise<VisitChangeState> {
  const business = await getMemberBusiness(orgId);
  if (!business || !isUuid(visitId)) return { message: "No tienes permiso para modificar esta visita." };
  const { supabase } = await requireUser();
  // La visita debe pertenecer también al negocio de la URL, no solo al usuario.
  const { data: visit, error } = await supabase.from("visits").select("customer_id")
    .eq("organization_id", business.id).eq("id", visitId).maybeSingle();
  if (error) return { message: dbErrorMessage(error) };
  if (!visit) return { message: "No se encontró la visita." };
  if (operation === "correct") {
    const parsed = validateVisitCorrection(formData);
    if (!parsed.ok) return { message: parsed.error };
    const { error: rpcError } = await supabase.rpc("correct_visit", {
      p_visit_id: visitId, p_items: parsed.data.items, p_attended_by: parsed.data.attendedBy,
      p_reason: parsed.data.reason,
    });
    if (rpcError) return { message: dbErrorMessage(rpcError) };
  } else if (operation === "void") {
    const reason = validateVisitReason(formData.get("reason"));
    if (!reason) return { message: "Escribe un motivo de entre 1 y 300 caracteres." };
    if (formData.get("confirmed") !== "yes") return { message: "Confirma la anulación antes de continuar." };
    const { error: rpcError } = await supabase.rpc("void_last_visit", {
      p_customer_id: visit.customer_id, p_visit_id: visitId, p_reason: reason,
    });
    if (rpcError) return { message: dbErrorMessage(rpcError) };
  } else return { message: "Operación inválida." };
  revalidatePath(`/panel/${business.id}`, "layout");
  redirect(`/panel/${business.id}/clientes/${visit.customer_id}?cambio=${operation === "void" ? "anulada" : "corregida"}`);
}
