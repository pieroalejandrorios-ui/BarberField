"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { secondaryButtonClass } from "@/components/ui";
import { IMAGE_ACCEPT, prepareImage } from "@/lib/images";
import { MEDIA_BUCKET, type MediaKind } from "@/lib/media";
import { getSupabaseClient } from "@/lib/supabase/client";
import { addGalleryPhoto, setBarbershopImage, type ActionResult } from "./actions";

const MAX_SIDE: Record<MediaKind, number> = { logo: 512, cover: 1600, gallery: 1600 };

// Sube la imagen directamente a Storage (las políticas permiten solo al dueño
// escribir en su carpeta) y luego guarda la ruta con una Server Action. Si
// guardar falla, borra el archivo recién subido.
async function uploadAndSave(
  organizationId: string,
  kind: MediaKind,
  file: File,
  save: (path: string) => Promise<ActionResult>,
): Promise<string | null> {
  const prepared = await prepareImage(file, MAX_SIDE[kind]);
  if (!prepared.ok) return prepared.error;

  const supabase = getSupabaseClient();
  const path = `${organizationId}/${kind}/${crypto.randomUUID()}.${prepared.image.extension}`;
  const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, prepared.image.blob, {
    contentType: prepared.image.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) return "No se pudo subir la imagen. Revisa tu conexión e inténtalo de nuevo.";

  const result = await save(path);
  if (result.message) {
    const { error: cleanupError } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    if (cleanupError) console.error("No se pudo limpiar la imagen que no se guardó.");
    return result.message;
  }
  return null;
}

export function MediaUploadButton({
  organizationId,
  kind,
  label,
  disabled = false,
}: {
  organizationId: string;
  kind: MediaKind;
  label: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const save =
        kind === "gallery"
          ? (path: string) => addGalleryPhoto(organizationId, path)
          : (path: string) => setBarbershopImage(organizationId, kind, path);
      try {
        setError(await uploadAndSave(organizationId, kind, file, save));
      } catch {
        // Una respuesta perdida puede ocurrir después de guardar. No borrar
        // la imagen ni reintentar automáticamente sin comprobar el resultado.
        setError("No se pudo confirmar la subida. Recarga la página para comprobar si se guardó antes de intentarlo de nuevo.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />
      <button
        type="button"
        className={`${secondaryButtonClass} sm:w-auto`}
        disabled={disabled || pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "Subiendo…" : label}
      </button>
      <p className="text-sm text-brand-muted">JPG, PNG o WebP de hasta 5 MB.</p>
      {error ? (
        <p role="alert" className="text-sm text-red-700 ">
          {error}
        </p>
      ) : null}
    </div>
  );
}
