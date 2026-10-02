import Link from "next/link";
import { secondaryButtonClass } from "./ui";

export function EmptyState({ title, description, action }: {
  title: string; description: string; action?: { href: string; label: string };
}) {
  return <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-brand-line p-6">
    <p className="font-semibold">{title}</p>
    <p className="text-sm leading-relaxed text-brand-muted">{description}</p>
    {action ? <Link href={action.href} className={`${secondaryButtonClass} sm:w-auto`}>{action.label}</Link> : null}
  </div>;
}
