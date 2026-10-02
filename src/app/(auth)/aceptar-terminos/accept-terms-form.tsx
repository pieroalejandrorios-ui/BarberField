"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckboxField, FormMessage, buttonClass } from "@/components/ui";
import { acceptTerms, type AcceptTermsState } from "./actions";

const initialState: AcceptTermsState = {};

export function AcceptTermsForm({ askOwnerTerms }: { askOwnerTerms: boolean }) {
  const [state, formAction, pending] = useActionState(acceptTerms, initialState);
  const [terms, setTerms] = useState(false);
  const [ownerTerms, setOwnerTerms] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <CheckboxField
        id="acceptTerms"
        required
        checked={terms}
        onChange={(event) => setTerms(event.target.checked)}
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
      {askOwnerTerms ? (
        <CheckboxField
          id="acceptOwnerTerms"
          required
          checked={ownerTerms}
          onChange={(event) => setOwnerTerms(event.target.checked)}
          disabled={pending}
          error={state.errors?.acceptOwnerTerms}
          label={
            <>
              Acepto las{" "}
              <Link href="/terminos#duenos" target="_blank" className="font-medium underline">
                condiciones de dueño
              </Link>
              : soy responsable de los datos personales de los clientes de mis barberías.
            </>
          }
        />
      ) : null}

      <FormMessage message={state.message} />

      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Guardando…" : "Aceptar y continuar"}
      </button>
    </form>
  );
}
