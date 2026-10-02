import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass, secondaryButtonClass } from "@/components/ui";
import { getMyBusinesses, requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Mis barberías · Barber Field" };

const ROLE_LABELS = { owner: "Dueño", barber: "Trabajador" } as const;

export default async function PanelPage() {
  const { email } = await requireUser();
  const businesses = await getMyBusinesses();

  if (businesses.length === 1) redirect(`/panel/${businesses[0].id}`);

  if (businesses.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Bienvenido</h1>
        <p className="text-brand-muted">Consulta tus visitas en las barberías donde te atiendes o crea tu propia barbería.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/panel/mis-visitas" className={`${buttonClass} sm:w-auto`}>
            Ver mis visitas
          </Link>
          <Link href="/panel/nuevo" className={`${secondaryButtonClass} sm:w-auto`}>
            Crear mi barbería
          </Link>
        </div>
        <Link href="/barberias" className="text-sm font-medium underline">
          Explorar barberías
        </Link>
        <p className="rounded-xl bg-brand-soft p-4 text-sm">
          Si eres trabajador, pide al dueño que te agregue con tu correo ({email}).
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Elige una barbería</h1>
      <ul className="flex flex-col gap-2">
        {businesses.map((business) => (
          <li key={business.id}>
            <Link
              href={`/panel/${business.id}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-brand-line px-4 py-3 hover:bg-brand-canvas focus-visible:outline-2 focus-visible:outline-brand-ink"
            >
              <span className="font-medium">{business.name}</span>
              <span className="text-sm text-brand-muted">{ROLE_LABELS[business.role]}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/panel/nuevo" className="text-sm font-medium underline">
        Crear otra barbería
      </Link>
    </section>
  );
}
