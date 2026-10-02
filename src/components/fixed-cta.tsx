import Link from "next/link";
import { buttonClass } from "./ui";

export function FixedCta({ href, label, note }: { href: string; label: string; note: string }) {
  return <aside className="fixed-cta" aria-label="Acceso rápido">
    <div>
      <p className="fixed-cta-note">{note}</p>
      <Link href={href} className={buttonClass}>{label}<span aria-hidden="true" className="ml-4">↗</span></Link>
    </div>
  </aside>;
}
