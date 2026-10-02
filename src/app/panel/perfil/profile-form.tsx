"use client";

import { useActionState } from "react";
import { Field, FormMessage, buttonClass } from "@/components/ui";
import { saveProfile, type ProfileState } from "./actions";

export function ProfileForm({ phone }: { phone: string }) {
  const [state, formAction, pending] = useActionState(saveProfile, { status: "idle", phone } satisfies ProfileState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field
        id="phone"
        label="Celular (opcional)"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        defaultValue={state.phone}
        hint="9 dígitos, por ejemplo 987 654 321. Déjalo vacío para eliminarlo."
        error={state.fieldError}
      />
      {state.status === "success" ? (
        <p role="status" aria-live="polite" className="text-sm text-green-700">{state.message}</p>
      ) : (
        <FormMessage message={state.message} />
      )}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
