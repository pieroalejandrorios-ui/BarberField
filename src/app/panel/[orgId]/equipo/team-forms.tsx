"use client";

import { useActionState } from "react";
import { Field, FormMessage, buttonClass, secondaryButtonClass } from "@/components/ui";
import { addWorker, setWorkerActive, type AddWorkerState, type WorkerToggleState } from "./actions";

const initialAddState: AddWorkerState = { status: "idle", email: "" };

export function AddWorkerForm({ organizationId }: { organizationId: string }) {
  const [state, formAction, pending] = useActionState(addWorker.bind(null, organizationId), initialAddState);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <Field
        id="email"
        label="Correo del trabajador"
        type="email"
        autoComplete="off"
        inputMode="email"
        required
        defaultValue={state.email}
        hint="Debe haber creado su cuenta antes."
        error={state.fieldError}
      />
      {state.status === "success" ? (
        <p role="status" aria-live="polite" className="text-sm text-green-700 ">
          {state.message}
        </p>
      ) : (
        <FormMessage message={state.message} />
      )}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Agregando…" : "Agregar trabajador"}
      </button>
    </form>
  );
}

const initialToggleState: WorkerToggleState = {};

export function WorkerToggle({
  organizationId,
  userId,
  isActive,
  email,
}: {
  organizationId: string;
  userId: string;
  isActive: boolean;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(
    setWorkerActive.bind(null, organizationId, userId, !isActive),
    initialToggleState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-1 sm:items-end">
      <button
        type="submit"
        className={`${secondaryButtonClass} sm:w-auto`}
        disabled={pending}
        aria-label={`${isActive ? "Desactivar" : "Reactivar"} a ${email}`}
      >
        {pending ? "Guardando…" : isActive ? "Desactivar" : "Reactivar"}
      </button>
      {state.message ? (
        <p role="alert" className="text-sm text-red-700 ">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
