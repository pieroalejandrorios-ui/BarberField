import Link from "next/link";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

export default function NotFound() {
  return <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-5 py-12">
    <p className="text-sm font-medium text-brand-muted">Página no disponible</p>
    <h1 className="text-3xl font-semibold">No encontramos lo que buscas</h1>
    <p className="text-brand-muted">El enlace puede haber cambiado o la página todavía no está publicada.</p>
    <Link href="/" className={buttonClass}>Volver al inicio</Link>
    <Link href="/panel" className={secondaryButtonClass}>Ir a mi panel</Link>
  </main>;
}
