"use server";

import { revalidatePath } from "next/cache";
import { getOwnedBusiness, requireUser } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { normalizeEmail, validateEmail } from "@/lib/validation/auth";
import { isUuid } from "@/lib/validation/uuid";

export type AddWorkerState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldError?: string;
  email: string;
};

export type WorkerToggleState = { message?: string };

const NO_PERMISSION = "No tienes permiso para administrar este equipo.";

export async function addWorker(
  organizationId: string,
  _prev: AddWorkerState,
  formData: FormData,
): Promise<AddWorkerState> {
  const raw = formData.get("email");
  const email = normalizeEmail(typeof raw === "string" ? raw : "");

  const business = await getOwnedBusiness(organizationId);
  if (!business) return { status: "error", message: NO_PERMISSION, email };

  const emailError = validateEmail(email);
  if (emailError) return { status: "error", fieldError: emailError, email };

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("add_worker_by_email", {
    p_organization_id: business.id,
    p_email: email,
  });
  if (error) {
    const message = dbErrorMessage(error);
    // Los errores del correo se muestran junto al campo.
    return error.code === "PT002" || error.code === "PT003"
      ? { status: "error", fieldError: message, email }
      : { status: "error", message, email };
  }

  revalidatePath(`/panel/${business.id}/equipo`);
  const addedEmail = data[0]?.email ?? email;
  return { status: "success", message: `${addedEmail} ya es parte de tu equipo.`, email: "" };
}

export async function setWorkerActive(
  organizationId: string,
  userId: string,
  active: boolean,
): Promise<WorkerToggleState> {
  const business = await getOwnedBusiness(organizationId);
  if (!business || !isUuid(userId)) return { message: NO_PERMISSION };

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_worker_active", {
    p_organization_id: business.id,
    p_user_id: userId,
    p_active: active,
  });
  if (error) return { message: dbErrorMessage(error) };

  revalidatePath(`/panel/${business.id}/equipo`);
  return {};
}
