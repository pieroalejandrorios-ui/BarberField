"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMemberBusiness, getOwnedBusiness, requireUser } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { validateCustomer, type CustomerErrors, type CustomerValues } from "@/lib/validation/customer";
import { isUuid } from "@/lib/validation/uuid";

export type NewCustomerState =
  | { status: "idle" }
  | { status: "error"; message?: string; errors?: CustomerErrors; values: CustomerValues; consent: boolean }
  // El DNI ya existe en el negocio: se muestra ese cliente en vez de duplicarlo.
  | { status: "duplicate"; customerId: string; fullName: string; archived: boolean; values: CustomerValues; consent: boolean }
  // El celular ya existe: se avisa y se permite continuar.
  // `phone` es el celular normalizado que se confirma; si cambia, se revisa de nuevo.
  | { status: "phone_warning"; names: string[]; phone: string; values: CustomerValues; consent: boolean };

export type EditCustomerState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: CustomerErrors;
  values?: CustomerValues;
};

export type ActionResult = { message?: string };

function readValues(formData: FormData): CustomerValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return { fullName: text("fullName"), dni: text("dni"), phone: text("phone") };
}

export async function createCustomer(
  organizationId: string,
  _prev: NewCustomerState,
  formData: FormData,
): Promise<NewCustomerState> {
  const values = readValues(formData);
  const consent = formData.get("consent") === "on";
  const confirmedPhone = formData.get("confirmedPhone");

  const business = await getMemberBusiness(organizationId);
  if (!business) {
    return { status: "error", message: "No tienes permiso para registrar clientes aquí.", values, consent };
  }

  const result = validateCustomer(values);
  const errors: CustomerErrors = result.ok ? {} : { ...result.errors };
  if (!consent) errors.consent = "Sin la autorización del cliente no se puede guardar.";
  if (!result.ok || !consent) return { status: "error", errors, values, consent };
  const { data } = result;

  const { supabase, userId } = await requireUser();

  // El DNI es único en el negocio, incluidos los archivados.
  const existing = await supabase
    .from("customers")
    .select("id, full_name, archived_at")
    .eq("organization_id", business.id)
    .eq("dni", data.dni)
    .maybeSingle();
  if (existing.error) return { status: "error", message: dbErrorMessage(existing.error), values, consent };
  if (existing.data) {
    return {
      status: "duplicate",
      customerId: existing.data.id,
      fullName: existing.data.full_name,
      archived: existing.data.archived_at !== null,
      values,
      consent,
    };
  }

  if (confirmedPhone !== data.phone) {
    const samePhone = await supabase
      .from("customers")
      .select("full_name")
      .eq("organization_id", business.id)
      .eq("phone", data.phone)
      .order("full_name")
      .limit(3);
    if (samePhone.error) return { status: "error", message: dbErrorMessage(samePhone.error), values, consent };
    if (samePhone.data.length > 0) {
      return { status: "phone_warning", names: samePhone.data.map((c) => c.full_name), phone: data.phone, values, consent };
    }
  }

  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      organization_id: business.id,
      full_name: data.fullName,
      dni: data.dni,
      phone: data.phone,
      consent_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    // Otro registro con el mismo DNI pudo guardarse al mismo tiempo.
    if (error.code === "23505") {
      const duplicate = await supabase
        .from("customers")
        .select("id, full_name, archived_at")
        .eq("organization_id", business.id)
        .eq("dni", data.dni)
        .maybeSingle();
      if (!duplicate.error && duplicate.data) {
        return {
          status: "duplicate",
          customerId: duplicate.data.id,
          fullName: duplicate.data.full_name,
          archived: duplicate.data.archived_at !== null,
          values,
          consent,
        };
      }
      return { status: "error", errors: { dni: "Ya existe un cliente con ese DNI. Búscalo en la lista." }, values, consent };
    }
    return { status: "error", message: dbErrorMessage(error), values, consent };
  }

  revalidatePath(`/panel/${business.id}/clientes`);
  redirect(`/panel/${business.id}/clientes/${created.id}`);
}

export async function updateCustomer(
  organizationId: string,
  customerId: string,
  _prev: EditCustomerState,
  formData: FormData,
): Promise<EditCustomerState> {
  const values = readValues(formData);
  const business = await getOwnedBusiness(organizationId);
  if (!business || !isUuid(customerId)) {
    return { status: "error", message: "Solo el dueño puede editar clientes.", values };
  }

  const result = validateCustomer(values);
  if (!result.ok) return { status: "error", errors: result.errors, values };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("customers")
    .update({ full_name: result.data.fullName, dni: result.data.dni, phone: result.data.phone })
    .eq("organization_id", business.id)
    .eq("id", customerId)
    .select("id");
  if (error) {
    if (error.code === "23505") {
      return { status: "error", errors: { dni: "Ya existe otro cliente con ese DNI." }, values };
    }
    return { status: "error", message: dbErrorMessage(error), values };
  }
  if (data.length !== 1) return { status: "error", message: "No se encontró el cliente. Recarga la página.", values };

  revalidatePath(`/panel/${business.id}/clientes`, "layout");
  return { status: "success", message: "Cambios guardados." };
}

export async function setCustomerArchived(
  organizationId: string,
  customerId: string,
  archived: boolean,
): Promise<ActionResult> {
  const business = await getOwnedBusiness(organizationId);
  if (!business || !isUuid(customerId)) return { message: "Solo el dueño puede archivar clientes." };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("customers")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("organization_id", business.id)
    .eq("id", customerId)
    .select("id");
  if (error) return { message: dbErrorMessage(error) };
  if (data.length !== 1) return { message: "No se encontró el cliente. Recarga la página." };

  revalidatePath(`/panel/${business.id}/clientes`, "layout");
  return {};
}
