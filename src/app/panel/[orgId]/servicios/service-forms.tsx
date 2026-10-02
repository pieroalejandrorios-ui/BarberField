"use client";

import { useActionState } from "react";
import { Field, FormMessage, TextAreaField, buttonClass } from "@/components/ui";
import {
  SERVICE_DESCRIPTION_MAX_LENGTH,
  SERVICE_DURATION_MAX,
  SERVICE_NAME_MAX_LENGTH,
  type ServiceFormValues,
} from "@/lib/validation/service";
import { saveService, type ServiceFormState } from "./actions";

const EMPTY_VALUES: ServiceFormValues = {
  name: "",
  description: "",
  price: "",
  durationMinutes: "",
  isPublished: true,
};

const initialFormState: ServiceFormState = { status: "idle" };

export function ServiceForm({
  organizationId,
  serviceId = null,
  initialValues = EMPTY_VALUES,
}: {
  organizationId: string;
  serviceId?: string | null;
  initialValues?: ServiceFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    saveService.bind(null, organizationId, serviceId),
    initialFormState,
  );
  // Si hubo error se conserva lo escrito; si no, los valores guardados.
  const values = state.status === "error" && state.values ? state.values : initialValues;
  const prefix = serviceId ?? "new";

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field
        id={`${prefix}-name`}
        name="name"
        label="Nombre"
        required
        maxLength={SERVICE_NAME_MAX_LENGTH}
        defaultValue={values.name}
        error={state.errors?.name}
      />
      <Field
        id={`${prefix}-price`}
        name="price"
        label="Precio (S/)"
        inputMode="decimal"
        required
        placeholder="25.00"
        defaultValue={values.price}
        error={state.errors?.price}
      />
      <Field
        id={`${prefix}-duration`}
        name="durationMinutes"
        label="Duración en minutos (opcional)"
        inputMode="numeric"
        hint={`Entre 1 y ${SERVICE_DURATION_MAX}.`}
        defaultValue={values.durationMinutes}
        error={state.errors?.durationMinutes}
      />
      <TextAreaField
        id={`${prefix}-description`}
        name="description"
        label="Descripción (opcional)"
        rows={2}
        maxLength={SERVICE_DESCRIPTION_MAX_LENGTH}
        defaultValue={values.description}
        error={state.errors?.description}
      />
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          name="isPublished"
          defaultChecked={values.isPublished}
          className="size-5 accent-brand-ink"
        />
        <span>Mostrar en la página pública</span>
      </label>

      {state.status === "success" ? (
        <p role="status" aria-live="polite" className="text-sm text-green-700 ">
          {state.message}
        </p>
      ) : (
        <FormMessage message={state.message} />
      )}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Guardando…" : serviceId ? "Guardar cambios" : "Agregar servicio"}
      </button>
    </form>
  );
}
