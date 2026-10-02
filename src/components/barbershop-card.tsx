import Image from "next/image";
import Link from "next/link";
import { publicMediaUrl } from "@/lib/media";
import { todayHoursLabel } from "@/lib/opening-hours";
import type { NetworkCard } from "@/lib/network";

// Tarjeta de la red: foto de perfil y, debajo, descripción, distrito y horario.
export function BarbershopCard({ card, now }: { card: NetworkCard; now: Date }) {
  const place = [card.district, card.city].filter(Boolean).join(", ");
  const hours = todayHoursLabel(card.hours, now);

  return (
    <Link
      href={`/b/${card.slug}`}
      className="relative flex h-full flex-col gap-4 rounded-2xl border border-brand-line bg-white p-5 shadow-[0_16px_45px_-32px_#172c2640] hover:border-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
    >
      <div className="flex items-center gap-3">
        {card.logoPath ? (
          <Image
            src={publicMediaUrl(card.logoPath)}
            alt=""
            width={64}
            height={64}
            sizes="64px"
            className="size-16 shrink-0 rounded-full border border-brand-line object-cover"
          />
        ) : (
          <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-ink text-xl font-semibold text-brand-accent">
            {card.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <h3 className="min-w-0 text-lg leading-snug font-semibold break-words">{card.name}</h3>
      </div>
      {card.description ? (
        <p className="line-clamp-3 text-sm leading-relaxed text-brand-muted">{card.description}</p>
      ) : null}
      <dl className="mt-auto flex flex-col gap-1 text-sm">
        {place ? (
          <div className="flex gap-2">
            <dt className="sr-only">Distrito</dt>
            <dd className="font-medium">{place}</dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="sr-only">Horario</dt>
          <dd className="text-brand-hover">{hours ?? "Horario no publicado"}</dd>
        </div>
      </dl>
    </Link>
  );
}
