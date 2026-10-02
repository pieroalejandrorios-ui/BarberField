"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Field, FormMessage, buttonClass } from "@/components/ui";
import { ADDRESS_MAX_LENGTH, BUSINESS_NAME_MAX_LENGTH } from "@/lib/validation/business";
import { SLUG_MAX_LENGTH, slugify } from "@/lib/validation/slug";
import { createBusiness, type CreateBusinessState } from "./actions";

const initialState: CreateBusinessState = {};

export function CreateBusinessForm() {
  const [state, formAction, pending] = useActionState(createBusiness, initialState);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [slug, setSlug] = useState("");
  // Mientras el dueño no edite el enlace, se propone a partir del nombre.
  const [slugEdited, setSlugEdited] = useState(false);

  // Envío manual para que React no reinicie los campos controlados si hay error.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field
        id="name"
        label="Nombre de la barbería"
        autoComplete="organization"
        required
        maxLength={BUSINESS_NAME_MAX_LENGTH}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          if (!slugEdited) setSlug(slugify(event.target.value));
        }}
        error={state.errors?.name}
      />
      <Field
        id="address"
        label="Dirección"
        autoComplete="street-address"
        required
        maxLength={ADDRESS_MAX_LENGTH}
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        error={state.errors?.address}
      />
      <Field
        id="slug"
        label="Enlace de tu página"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        maxLength={SLUG_MAX_LENGTH}
        value={slug}
        onChange={(event) => {
          setSlugEdited(true);
          setSlug(event.target.value.toLowerCase());
        }}
        hint={
          <>
            Tu página pública será <span className="font-mono">/b/{slug || "tu-barberia"}</span>. Solo
            minúsculas, números y guiones.
          </>
        }
        error={state.errors?.slug}
      />

      <FormMessage message={state.message} />

      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Creando…" : "Crear barbería"}
      </button>
    </form>
  );
}
