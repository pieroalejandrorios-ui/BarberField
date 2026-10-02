"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage } from "@/lib/supabase/errors";
import { normalizeEmail, validateEmail, validatePassword } from "@/lib/validation/auth";

export type AuthFormState = {
  message?: string;
  errors?: { email?: string; password?: string; confirmPassword?: string };
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
  if (Object.keys(errors).length > 0) return { errors, email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { message: authErrorMessage(error), email };

  // Sin sesión significa que Supabase exige confirmar el correo (debe estar
  // desactivado en la v1).
  if (!data.session) {
    return {
      message: "Tu cuenta se creó, pero falta confirmar el correo. Avisa al administrador.",
      email,
    };
  }

  redirect("/panel");
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

  redirect("/panel");
}
