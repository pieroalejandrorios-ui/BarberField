"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import {
  normalizeBusinessInput,
  validateBusiness,
  type BusinessErrors,
  type BusinessInput,
} from "@/lib/validation/business";

export type CreateBusinessState = { message?: string; errors?: BusinessErrors };

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createBusiness(
  _prev: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const { supabase } = await requireUser();

  const input: BusinessInput = normalizeBusinessInput({
    name: readString(formData, "name"),
    address: readString(formData, "address"),
    slug: readString(formData, "slug"),
  });
  const errors = validateBusiness(input);
  if (Object.keys(errors).length > 0) return { errors };

  // La función autoriza (sesión y regla de trabajador activo) y crea todo en
  // una sola transacción.
  const { data, error } = await supabase.rpc("create_business", {
    p_name: input.name,
    p_address: input.address,
    p_slug: input.slug,
  });

  if (error) {
    if (error.code === "23505") {
      return { errors: { slug: "Ese enlace ya está en uso. Prueba con otro." } };
    }
    return { message: dbErrorMessage(error) };
  }
  if (typeof data !== "string") return { message: dbErrorMessage({ code: "unknown" }) };

  redirect(`/panel/${data}`);
}
