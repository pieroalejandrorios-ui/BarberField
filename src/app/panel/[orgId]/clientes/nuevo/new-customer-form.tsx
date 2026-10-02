"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, buttonClass } from "@/components/ui";
import type { CustomerValues } from "@/lib/validation/customer";
import { createCustomer, type NewCustomerState } from "../actions";
import { CustomerFields } from "../customer-fields";

const initialState: NewCustomerState = { status: "idle" };
const EMPTY: CustomerValues = { fullName: "", dni: "", phone: "", email: "" };

export function NewCustomerForm({ organizationId }: { organizationId: string }) {
  const [state, formAction, pending] = useActionState(createCustomer.bind(null, organizationId), initialState);
  const values = state.status === "idle" ? EMPTY : state.values;
  const consent = state.status === "idle" ? false : state.consent;
  const errors = state.status === "error" ? state.errors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <CustomerFields values={values} errors={errors} />

      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            name="consent"
            required
            defaultChecked={consent}
            aria-invalid={errors?.consent ? true : undefined}
            aria-describedby={errors?.consent ? "consent-error" : undefined}
            className="mt-1 size-5 shrink-0 accent-brand-ink"
          />
          <span>El cliente autorizó el registro de sus datos personales.</span>
        </label>
        {errors?.consent ? (
          <p id="consent-error" className="text-sm text-red-700 ">
            {errors.consent}
          </p>
        ) : null}
      </div>

      {state.status === "duplicate" ? (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-amber-50 p-4 text-amber-900">
          <p>
            Ya existe un cliente con ese DNI: <strong>{state.fullName}</strong>
            {state.archived ? " (archivado)" : ""}.
          </p>
          <Link href={`/panel/${organizationId}/clientes/${state.customerId}`} className="font-medium underline">
            Ver cliente
          </Link>
        </div>
      ) : null}

      {state.status === "phone_warning" ? (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-amber-50 p-4 text-amber-900">
          <p>
            Ese celular ya está registrado para {state.names.join(", ")}. Si es correcto (por ejemplo, un familiar),
            puedes continuar.
          </p>
          <input type="hidden" name="confirmedPhone" value={state.phone} />
        </div>
      ) : null}

      <FormMessage message={state.status === "error" ? state.message : undefined} />

      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Guardando…" : state.status === "phone_warning" ? "Registrar de todas formas" : "Registrar cliente"}
      </button>
    </form>
  );
}
