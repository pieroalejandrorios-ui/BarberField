"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Business } from "@/lib/session";

const ROLE_LABELS = { owner: "Dueño", barber: "Trabajador" } as const;

// Selector de local activo para quien trabaja en (o es dueño de) más de una
// barbería. El local activo es el de la URL. `key` cierra el menú al navegar.
export function BusinessSwitcher({ businesses }: { businesses: Business[] }) {
  const pathname = usePathname();
  const currentId = /^\/panel\/([^/]+)/.exec(pathname)?.[1];
  const current = businesses.find((business) => business.id === currentId);

  return (
    <details key={pathname} className="group relative w-full sm:w-auto">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-brand-line bg-white px-3 text-sm font-medium hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ink [&::-webkit-details-marker]:hidden">
        <span className="truncate">
          <span className="sr-only">Barbería activa: </span>
          {current ? current.name : "Elegir barbería"}
        </span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
      </summary>
      <ul className="absolute inset-x-0 z-50 mt-2 flex flex-col gap-1 rounded-xl border border-brand-line bg-white p-2 shadow-[0_16px_45px_-20px_#172c2640]">
        {businesses.map((business) => (
          <li key={business.id}>
            <Link
              href={`/panel/${business.id}`}
              aria-current={business.id === currentId ? "page" : undefined}
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ink aria-[current=page]:bg-brand-ink aria-[current=page]:text-white"
            >
              <span className="truncate font-medium">{business.name}</span>
              <span className="shrink-0 text-xs opacity-75">{ROLE_LABELS[business.role]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
