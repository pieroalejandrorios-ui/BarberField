"use client";

import { useActionState } from "react";
import { FormMessage, buttonClass } from "@/components/ui";
import type { CustomerValues } from "@/lib/validation/customer";
import { updateCustomer, type EditCustomerState } from "../actions";
import { CustomerFields } from "../customer-fields";

const initialState: EditCustomerState = { status: "idle" };

export function EditCustomerForm({
  organizationId,
  customerId,
  initialValues,
}: {
  organizationId: string;
  customerId: string;
  initialValues: CustomerValues;
}) {
  const [state, formAction, pending] = useActionState(
    updateCustomer.bind(null, organizationId, customerId),
    initialState,
  );
  const values = state.status === "error" && state.values ? state.values : initialValues;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <CustomerFields values={values} errors={state.errors} />
      {state.status === "success" ? (
        <p role="status" aria-live="polite" className="text-sm text-green-700 ">
          {state.message}
        </p>
      ) : (
        <FormMessage message={state.message} />
      )}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
