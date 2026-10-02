"use server";

import { redirect } from "next/navigation";
import { getAccount, requireUser } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { OWNER_TERMS_VERSION, TERMS_VERSION } from "@/lib/legal";
import { HOME_PATH } from "@/lib/home";

export type AcceptTermsState = {
  message?: string;
  errors?: { acceptTerms?: string; acceptOwnerTerms?: string };
};

export async function acceptTerms(_prev: AcceptTermsState, formData: FormData): Promise<AcceptTermsState> {
  const { supabase } = await requireUser();
  const account = await getAccount();

  const errors: AcceptTermsState["errors"] = {};
  if (formData.get("acceptTerms") !== "on") {
    errors.acceptTerms = "Debes aceptar los Términos y la Política de Privacidad para continuar.";
  }
  if (account.ownerTermsPending && formData.get("acceptOwnerTerms") !== "on") {
    errors.acceptOwnerTerms = "Como dueño, debes aceptar las condiciones de dueño para continuar.";
  }
  if (Object.keys(errors).length > 0) return { errors };

  const { error } = await supabase.rpc("accept_terms", {
    p_terms_version: TERMS_VERSION,
    p_owner_terms_version: account.ownerTermsPending ? OWNER_TERMS_VERSION : null,
  });
  if (error) return { message: dbErrorMessage(error) };

  redirect(HOME_PATH);
}
