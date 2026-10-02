"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { OWNER_TERMS_VERSION } from "@/lib/legal";
import {
  normalizeBusinessInput,
  validateBusiness,
  type BusinessErrors,
  type BusinessInput,
} from "@/lib/validation/business";

export type CreateBusinessState = {
  message?: string;
  errors?: BusinessErrors & { acceptOwnerTerms?: string };
};

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
  const errors: NonNullable<CreateBusinessState["errors"]> = validateBusiness(input);
  if (formData.get("acceptOwnerTerms") !== "on") {
    errors.acceptOwnerTerms = "Para crear tu barbería debes aceptar las condiciones de dueño.";
  }
  if (Object.keys(errors).length > 0) return { errors };

  // La función autoriza (sesión y regla de trabajador activo), registra las
  // condiciones de dueño, concede Pro y crea todo en una sola transacción.
  const { data, error } = await supabase.rpc("create_business", {
    p_name: input.name,
    p_address: input.address,
    p_slug: input.slug,
    p_owner_terms_version: OWNER_TERMS_VERSION,
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
