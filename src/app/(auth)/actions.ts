"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage } from "@/lib/supabase/errors";
import { normalizeEmail, validateEmail, validatePassword } from "@/lib/validation/auth";
import { TERMS_VERSION } from "@/lib/legal";
import { HOME_PATH } from "@/lib/home";

export type AuthFormState = {
  message?: string;
  errors?: { email?: string; password?: string; confirmPassword?: string; acceptTerms?: string };
  // Solo el correo se devuelve para conservarlo; nunca la contraseña.
  email: string;
};

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(readString(formData, "email"));
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");

  const errors: AuthFormState["errors"] = {};
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;
  if (password !== confirmPassword) errors.confirmPassword = "Las contraseñas no coinciden.";
  if (formData.get("acceptTerms") !== "on") {
    errors.acceptTerms = "Para crear tu cuenta debes aceptar los Términos y la Política de Privacidad.";
  }
  if (Object.keys(errors).length > 0) return { errors, email };

  const supabase = await createClient();
  // La base de datos guarda la aceptación (versión y fecha) al crear la cuenta.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { terms_version: TERMS_VERSION } },
  });
  if (error) return { message: authErrorMessage(error), email };

  // Sin sesión significa que Supabase exige confirmar el correo (debe estar
  // desactivado en la v1).
  if (!data.session) {
    return {
      message: "Tu cuenta se creó, pero falta confirmar el correo. Avisa al administrador.",
      email,
    };
  }

  redirect(HOME_PATH);
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(readString(formData, "email"));
  const password = readString(formData, "password");

  const errors: AuthFormState["errors"] = {};
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (password.length === 0) errors.password = "Escribe tu contraseña.";
  if (Object.keys(errors).length > 0) return { errors, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { message: authErrorMessage(error), email };

  // Quien no aceptó los términos vigentes los acepta antes de entrar.
  const { data: account } = await supabase.rpc("get_my_account").maybeSingle();
  if (!account || !account.terms_accepted || account.owner_terms_pending) redirect("/aceptar-terminos");
  redirect(HOME_PATH);
}
