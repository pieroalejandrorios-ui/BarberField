import Link from "next/link";
import { Brand } from "@/components/brand";

const NAV = [
  { href: "/barberias", label: "Barberías", key: "barberias" },
  { href: "/#funciones", label: "Funciones", key: "funciones" },
  { href: "/#como-funciona", label: "Cómo funciona", key: "como-funciona" },
  { href: "/#preguntas", label: "Preguntas", key: "preguntas" },
] as const;

// Menú superior compartido por la landing y la red de barberías.
export function SiteHeader({ current, signedIn = false }: { current?: "barberias"; signedIn?: boolean }) {
  return (
    <header className="border-b border-brand-ink/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-8">
        <Link href="/" aria-label="Barber Field, inicio" className="flex min-h-11 items-center gap-3 font-semibold tracking-tight">
          <Brand />
        </Link>
        {signedIn ? (
          <Link href="/panel" className="inline-flex min-h-11 items-center rounded-xl bg-brand-ink px-4 text-sm font-semibold text-white hover:bg-brand-hover lg:order-3">Mi panel <span aria-hidden="true" className="ml-2">↗</span></Link>
        ) : (
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold lg:order-3">Iniciar sesión <span aria-hidden="true" className="ml-2">↗</span></Link>
        )}
        <nav aria-label="Navegación principal" className="w-full lg:w-auto">
          <ul className="flex flex-wrap gap-x-5 text-sm text-[#43574b]">
            {NAV.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={current === item.key ? "page" : undefined}
                  className="inline-flex min-h-11 items-center aria-[current=page]:font-semibold aria-[current=page]:text-brand-ink aria-[current=page]:underline aria-[current=page]:underline-offset-4"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm sm:px-8"><p className="font-semibold">Barber Field</p><p className="text-brand-muted">Clientes, visitas y premios. A tu manera.</p><div className="flex flex-wrap gap-x-5"><Link href="/barberias" className="inline-flex min-h-11 items-center underline underline-offset-4">Barberías</Link><Link href="/terminos" className="inline-flex min-h-11 items-center underline underline-offset-4">Términos</Link><Link href="/privacidad" className="inline-flex min-h-11 items-center underline underline-offset-4">Privacidad</Link><Link href="/login" className="inline-flex min-h-11 items-center underline underline-offset-4">Iniciar sesión</Link></div></footer>
  );
}
