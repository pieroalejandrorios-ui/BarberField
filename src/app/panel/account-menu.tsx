"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "./actions";

const itemClass =
  "flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ink aria-[current=page]:font-semibold";

// Menú de la cuenta: «Mis visitas», perfil y cierre de sesión. `key` lo
// cierra al navegar.
export function AccountMenu({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <details key={pathname} className="group relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-xl px-3 text-sm font-medium hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ink [&::-webkit-details-marker]:hidden">
        Cuenta <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 flex w-64 flex-col gap-1 rounded-xl border border-brand-line bg-white p-2 shadow-[0_16px_45px_-20px_#172c2640]">
        <p className="truncate px-3 py-2 text-xs text-brand-muted">{email}</p>
        <Link href="/panel" aria-current={pathname === "/panel" ? "page" : undefined} className={itemClass}>
          Mi panel
        </Link>
        <Link href="/panel/mis-visitas" aria-current={pathname === "/panel/mis-visitas" ? "page" : undefined} className={itemClass}>
          Mis visitas
        </Link>
        <Link href="/panel/perfil" aria-current={pathname === "/panel/perfil" ? "page" : undefined} className={itemClass}>
          Mi perfil
        </Link>
        <form action={signOut}>
          <button type="submit" className={itemClass}>Cerrar sesión</button>
        </form>
      </div>
    </details>
  );
}
