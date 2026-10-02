import Link from "next/link";
import { secondaryButtonClass } from "@/components/ui";

export default function PanelNotFound() {
  return <section className="flex flex-col gap-4">
    <h1 className="text-2xl font-semibold">Esta página no está disponible</h1>
    <p className="text-brand-muted">Revisa el enlace y que tu cuenta tenga acceso a esta barbería.</p>
    <Link href="/panel" className={`${secondaryButtonClass} sm:w-auto`}>Volver a mis barberías</Link>
  </section>;
}
