"use client";

import { useActionState } from "react";
import { Field, secondaryButtonClass } from "@/components/ui";
import { CAPTION_MAX_LENGTH } from "@/lib/validation/page";
import { updatePhotoCaption, type CaptionFormState } from "./actions";

const initialState: CaptionFormState = { status: "idle" };

export function CaptionForm({
  organizationId,
  photoId,
  caption,
  position,
}: {
  organizationId: string;
  photoId: string;
  caption: string;
  position: number;
}) {
  const [state, formAction, pending] = useActionState(
    updatePhotoCaption.bind(null, organizationId, photoId),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Field
        id={`caption-${photoId}`}
        name="caption"
        label={`Leyenda de la foto ${position}`}
        maxLength={CAPTION_MAX_LENGTH}
        defaultValue={caption}
        error={state.status === "error" ? state.message : undefined}
      />
      {state.status === "success" ? (
        <p role="status" className="text-sm text-green-700 ">
          {state.message}
        </p>
      ) : null}
      <button type="submit" className={secondaryButtonClass} disabled={pending}>
        {pending ? "Guardando…" : "Guardar leyenda"}
      </button>
    </form>
  );
}
