"use server";

import { revalidatePath } from "next/cache";
import { getOwnedBusiness, requireUser } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { isUuid } from "@/lib/validation/uuid";
import {
  validateService,
  type ServiceErrors,
  type ServiceFormValues,
} from "@/lib/validation/service";

export type ServiceFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: ServiceErrors;
  values?: ServiceFormValues;
};

export type ServiceActionState = { message?: string };

const NO_PERMISSION = "No tienes permiso para cambiar los servicios.";
const NOT_FOUND = "No se encontró el servicio. Recarga la página.";

function readValues(formData: FormData): ServiceFormValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    name: text("name"),
    description: text("description"),
    price: text("price"),
    durationMinutes: text("durationMinutes"),
    isPublished: formData.get("isPublished") === "on",
  };
}

async function nextSortOrder(organizationId: string): Promise<number | { error: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("services")
    .select("sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: dbErrorMessage(error) };
  return (data?.sort_order ?? 0) + 1;
}

export async function saveService(
  organizationId: string,
  serviceId: string | null,
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const values = readValues(formData);
  const business = await getOwnedBusiness(organizationId);
  if (!business || (serviceId !== null && !isUuid(serviceId))) {
    return { status: "error", message: NO_PERMISSION, values };
  }

  const result = validateService(values);
  if (!result.ok) return { status: "error", errors: result.errors, values };

  const { supabase } = await requireUser();
  const fields = {
    name: result.data.name,
    description: result.data.description,
    // El texto ya tiene como máximo 2 decimales; JSON lo envía con el mismo
    // valor decimal y Postgres lo guarda exacto en numeric(10,2).
    price: Number(result.data.price),
    duration_minutes: result.data.durationMinutes,
    is_published: result.data.isPublished,
  };

  if (serviceId === null) {
    const sortOrder = await nextSortOrder(business.id);
    if (typeof sortOrder !== "number") return { status: "error", message: sortOrder.error, values };

    const { error } = await supabase
      .from("services")
      .insert({ ...fields, organization_id: business.id, sort_order: sortOrder });
    if (error) return { status: "error", message: dbErrorMessage(error), values };

    revalidatePath(`/panel/${business.id}/servicios`);
    return { status: "success", message: `Se agregó «${result.data.name}».` };
  }

  const { data, error } = await supabase
    .from("services")
    .update(fields)
    .eq("organization_id", business.id)
    .eq("id", serviceId)
    .select("id");
  if (error) return { status: "error", message: dbErrorMessage(error), values };
  if (data.length !== 1) return { status: "error", message: NOT_FOUND, values };

  revalidatePath(`/panel/${business.id}/servicios`);
  return { status: "success", message: "Cambios guardados." };
}

export async function setServiceArchived(
  organizationId: string,
  serviceId: string,
  archived: boolean,
): Promise<ServiceActionState> {
  const business = await getOwnedBusiness(organizationId);
  if (!business || !isUuid(serviceId)) return { message: NO_PERMISSION };

  const { supabase } = await requireUser();
  let changes: { archived_at: string | null; sort_order?: number };
  if (archived) {
    changes = { archived_at: new Date().toISOString() };
  } else {
    // Un servicio restaurado vuelve al final de la lista.
    const sortOrder = await nextSortOrder(business.id);
    if (typeof sortOrder !== "number") return { message: sortOrder.error };
    changes = { archived_at: null, sort_order: sortOrder };
  }

  const { data, error } = await supabase
    .from("services")
    .update(changes)
    .eq("organization_id", business.id)
    .eq("id", serviceId)
    .select("id");
  if (error) return { message: dbErrorMessage(error) };
  if (data.length !== 1) return { message: NOT_FOUND };

  revalidatePath(`/panel/${business.id}/servicios`);
  return {};
}

export async function moveService(
  organizationId: string,
  serviceId: string,
  direction: "up" | "down",
): Promise<ServiceActionState> {
  const business = await getOwnedBusiness(organizationId);
  if (!business || !isUuid(serviceId)) return { message: NO_PERMISSION };

  const { supabase } = await requireUser();
  const { data: services, error } = await supabase
    .from("services")
    .select("id")
    .eq("organization_id", business.id)
    .is("archived_at", null)
    .order("sort_order")
    .order("created_at");
  if (error) return { message: dbErrorMessage(error) };

  const ids = services.map((service) => service.id);
  const index = ids.indexOf(serviceId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1) return { message: NOT_FOUND };
  if (target < 0 || target >= ids.length) return {};

  [ids[index], ids[target]] = [ids[target], ids[index]];
  const { error: reorderError } = await supabase.rpc("reorder_services", {
    p_organization_id: business.id,
    p_service_ids: ids,
  });
  if (reorderError) return { message: dbErrorMessage(reorderError) };

  revalidatePath(`/panel/${business.id}/servicios`);
  return {};
}
