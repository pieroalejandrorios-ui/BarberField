"use client";

import { useActionState } from "react";
import { Field, FormMessage, buttonClass } from "@/components/ui";
import { SOCIAL_PLATFORMS } from "@/lib/validation/page";
import { URL_MAX_LENGTH } from "@/lib/validation/url";
import { saveSocialLinks, type LinksFormState } from "./actions";

const initialState: LinksFormState = { status: "idle" };

export function LinksForm({
  organizationId,
  initialValues,
}: {
  organizationId: string;
  initialValues: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(saveSocialLinks.bind(null, organizationId), initialState);
  const values = state.status === "error" && state.values ? state.values : initialValues;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {SOCIAL_PLATFORMS.map(({ platform, label, placeholder }) => (
        <Field
          key={platform}
          id={`social-${platform}`}
          name={platform}
          label={label}
          type="url"
          inputMode="url"
          maxLength={URL_MAX_LENGTH}
          placeholder={placeholder}
          defaultValue={values[platform] ?? ""}
          error={state.errors?.[platform]}
        />
      ))}

      {state.status === "success" ? (
        <p role="status" aria-live="polite" className="text-sm text-green-700 ">
          {state.message}
        </p>
      ) : (
        <FormMessage message={state.message} />
      )}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Guardando…" : "Guardar redes"}
      </button>
    </form>
  );
}
