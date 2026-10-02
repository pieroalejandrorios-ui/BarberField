"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckboxField, Field, FormMessage, buttonClass } from "@/components/ui";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { signIn, signUp, type AuthFormState } from "./actions";

const initialState: AuthFormState = { email: "" };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [state, formAction, pending] = useActionState(isSignup ? signUp : signIn, initialState);
  const [email, setEmail] = useState("");
  // Solo en memoria del navegador; nunca se devuelven contraseñas desde el servidor.
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field
        id="email"
        label="Correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={event => setEmail(event.target.value)}
        disabled={pending}
        error={state.errors?.email}
      />
      <Field
        id="password"
        label="Contraseña"
        type="password"
        autoComplete={isSignup ? "new-password" : "current-password"}
        required
        value={password}
        onChange={event => setPassword(event.target.value)}
        disabled={pending}
        minLength={isSignup ? PASSWORD_MIN_LENGTH : undefined}
        hint={isSignup ? `Mínimo ${PASSWORD_MIN_LENGTH} caracteres.` : undefined}
        error={state.errors?.password}
      />
      {isSignup ? (
        <Field
          id="confirmPassword"
          label="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={event => setConfirmation(event.target.value)}
          disabled={pending}
          error={state.errors?.confirmPassword}
        />
      ) : null}
      {isSignup ? (
        <CheckboxField
          id="acceptTerms"
          required
          checked={acceptTerms}
          onChange={event => setAcceptTerms(event.target.checked)}
          disabled={pending}
          error={state.errors?.acceptTerms}
          label={
            <>
              Acepto los{" "}
              <Link href="/terminos" target="_blank" className="font-medium underline">
                Términos y condiciones
              </Link>{" "}
              y la{" "}
              <Link href="/privacidad" target="_blank" className="font-medium underline">
                Política de Privacidad
              </Link>
              .
            </>
          }
        />
      ) : null}

      <FormMessage message={state.message} />

      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Un momento…" : isSignup ? "Crear cuenta" : "Iniciar sesión"}
      </button>

      <p className="text-center text-sm text-brand-muted">
        {isSignup ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
        <Link href={isSignup ? "/login" : "/registro"} className="font-medium underline">
          {isSignup ? "Inicia sesión" : "Regístrate"}
        </Link>
      </p>
    </form>
  );
}
