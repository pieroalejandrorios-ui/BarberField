"use client";

import { buttonClass } from "@/components/ui";

export default function PanelError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <section role="alert" className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">No se pudo cargar esta página</h1>
      <p className="text-brand-muted">
        Revisa tu conexión e inténtalo de nuevo.
      </p>
      <button type="button" className={buttonClass} onClick={() => retry()}>
        Reintentar
      </button>
    </section>
  );
}
