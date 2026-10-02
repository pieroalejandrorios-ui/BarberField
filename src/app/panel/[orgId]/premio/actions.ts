"use server";

import { revalidatePath } from "next/cache";
import { getOwnedBusiness, requireUser } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { validateLoyalty, type LoyaltyErrors, type LoyaltyFormValues } from "@/lib/validation/loyalty";

export type LoyaltyFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: LoyaltyErrors;
  values?: LoyaltyFormValues;
};

function readValues(formData: FormData): LoyaltyFormValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    visitsRequired: text("visitsRequired"),
    rewardType: text("rewardType"),
    serviceId: text("serviceId"),
    percent: text("percent"),
    amount: text("amount"),
    description: text("description"),
    publicText: text("publicText"),
    isActive: formData.get("isActive") === "on",
  };
}

export async function saveLoyaltyProgram(
  organizationId: string,
  _prev: LoyaltyFormState,
  formData: FormData,
): Promise<LoyaltyFormState> {
  const values = readValues(formData);
  const business = await getOwnedBusiness(organizationId);
  if (!business) return { status: "error", message: "Solo el dueño puede configurar el premio.", values };

  const result = validateLoyalty(values);
  if (!result.ok) return { status: "error", errors: result.errors, values };
  const { data } = result;

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("save_loyalty_program", {
    p_organization_id: business.id,
    p_visits_required: data.visitsRequired,
    p_reward_type: data.rewardType,
    p_reward_service_id: data.serviceId,
    // Textos con como máximo 2 decimales: JSON los envía con el mismo valor
    // decimal y Postgres los guarda exactos en numeric.
    p_reward_percent: data.percent === null ? null : Number(data.percent),
    p_reward_amount: data.amount === null ? null : Number(data.amount),
    p_reward_description: data.description,
    p_public_text: data.publicText,
    p_status: data.isActive ? "active" : "paused",
  });
  if (error) {
    const message = dbErrorMessage(error, {
      PT011: "Ese servicio ya no está disponible. Elige otro.",
    });
    return { status: "error", message, values };
  }

  revalidatePath(`/panel/${business.id}`, "layout");
  return { status: "success", message: "Premio guardado." };
}
