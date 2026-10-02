import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";

// Composición compartida de /terminos y /privacidad.
export function LegalPage({ title, version, children }: { title: string; version: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-canvas text-brand-ink">
      <header className="border-b border-brand-ink/10">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 px-5 py-4 sm:px-8">
          <Link href="/" aria-label="Barber Field, inicio" className="flex min-h-11 items-center">
            <Brand />
          </Link>
          <nav aria-label="Documentos legales" className="flex gap-4 text-sm">
            <Link href="/terminos" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">Términos</Link>
            <Link href="/privacidad" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">Privacidad</Link>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-brand-muted">Versión {version}</p>
        </div>
        <p role="note" className="rounded-xl bg-brand-soft p-4 text-sm">
          Texto provisional, pendiente de revisión legal. Puede cambiar antes de la publicación definitiva; si cambia, te
          pediremos aceptar la nueva versión.
        </p>
        <div className="flex flex-col gap-4 rounded-2xl border border-brand-line bg-white p-6 leading-relaxed sm:p-8 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-6">
          {children}
        </div>
      </main>
    </div>
  );
}
