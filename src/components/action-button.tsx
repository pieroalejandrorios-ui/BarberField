"use client";

import { useActionState } from "react";
import { secondaryButtonClass } from "./ui";

type ActionResult = { message?: string };

const initialState: ActionResult = {};

// Botón para una acción simple (archivar, mover, publicar…) con su error.
export function ActionButton({
  action,
  label,
  accessibleLabel,
  disabled = false,
  className = `${secondaryButtonClass} sm:w-auto`,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  accessibleLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <button type="submit" className={className} disabled={disabled || pending} aria-label={accessibleLabel}>
        {label}
      </button>
      {state.message ? (
        <p role="alert" className="text-sm text-red-700 ">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
