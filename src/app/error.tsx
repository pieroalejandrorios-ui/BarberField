"use client";

import Link from "next/link";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-5 py-12">
    <h1 className="text-2xl font-semibold">No se pudo cargar la página</h1>
    <p role="alert" className="text-brand-muted">Revisa tu conexión y vuelve a intentarlo. Si el problema continúa, inténtalo más tarde.</p>
    <button type="button" onClick={retry} className={buttonClass}>Reintentar</button>
    <Link href="/" className={secondaryButtonClass}>Volver al inicio</Link>
  </main>;
}
