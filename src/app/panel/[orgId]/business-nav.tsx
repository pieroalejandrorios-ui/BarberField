"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string };

export function BusinessNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones de la barbería" className="overflow-x-auto rounded-2xl border border-brand-line bg-white p-3">
      <ul className="flex gap-2">
        {links.map((link, index) => {
          // El primer enlace (Inicio) solo se marca en su ruta exacta.
          const isCurrent =
            index === 0 ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isCurrent ? "page" : undefined}
                className="inline-flex min-h-11 items-center rounded-full border border-brand-line px-4 text-sm font-medium whitespace-nowrap hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ink aria-[current=page]:border-brand-ink aria-[current=page]:bg-brand-ink aria-[current=page]:text-white"
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
