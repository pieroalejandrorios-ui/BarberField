"use client";

import { useActionState } from "react";
import { Field, FormMessage, TextAreaField, buttonClass } from "@/components/ui";
import { ADDRESS_MAX_LENGTH, BUSINESS_NAME_MAX_LENGTH } from "@/lib/validation/business";
import { DESCRIPTION_MAX_LENGTH, PLACE_MAX_LENGTH, type PageDetailsValues } from "@/lib/validation/page";
import { SLUG_MAX_LENGTH } from "@/lib/validation/slug";
import { updatePageDetails, type DetailsFormState } from "./actions";

const initialState: DetailsFormState = { status: "idle" };

export function DetailsForm({
  organizationId,
  initialValues,
}: {
  organizationId: string;
  initialValues: PageDetailsValues;
}) {
  const [state, formAction, pending] = useActionState(
    updatePageDetails.bind(null, organizationId),
    initialState,
  );
  // Si hubo error se conserva lo escrito; si no, los valores guardados.
  const values = state.status === "error" && state.values ? state.values : initialValues;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field id="name" label="Nombre" required maxLength={BUSINESS_NAME_MAX_LENGTH} defaultValue={values.name} error={state.errors?.name} />
      <Field
        id="slug"
        label="Enlace"
        required
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={SLUG_MAX_LENGTH}
        defaultValue={values.slug}
        hint="Si lo cambias, el enlace anterior deja de funcionar."
        error={state.errors?.slug}
      />
      <TextAreaField
        id="description"
        label="Descripción"
        rows={4}
        maxLength={DESCRIPTION_MAX_LENGTH}
        defaultValue={values.description}
        hint={`Hasta ${DESCRIPTION_MAX_LENGTH} caracteres. Puedes usar saltos de línea.`}
        error={state.errors?.description}
      />
      <Field
        id="phone"
        label="Teléfono o WhatsApp"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={values.phone}
        hint="Si es un celular, se mostrará como enlace de WhatsApp."
        error={state.errors?.phone}
      />
      <Field id="address" label="Dirección" required maxLength={ADDRESS_MAX_LENGTH} defaultValue={values.address} error={state.errors?.address} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="district" label="Distrito" maxLength={PLACE_MAX_LENGTH} defaultValue={values.district} error={state.errors?.district} />
        <Field id="city" label="Ciudad" maxLength={PLACE_MAX_LENGTH} defaultValue={values.city} error={state.errors?.city} />
      </div>
      <Field
        id="mapsUrl"
        label="Enlace de Google Maps"
        type="url"
        inputMode="url"
        defaultValue={values.mapsUrl}
        hint="En Google Maps: Compartir → Copiar vínculo."
        error={state.errors?.mapsUrl}
      />

      {state.status === "success" ? (
        <p role="status" aria-live="polite" className="text-sm text-green-700 ">
          {state.message}
        </p>
      ) : (
        <FormMessage message={state.message} />
      )}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Guardando…" : "Guardar datos"}
      </button>
    </form>
  );
}
