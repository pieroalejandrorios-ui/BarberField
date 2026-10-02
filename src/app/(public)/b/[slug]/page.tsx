import type { Metadata } from "next";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { buttonClass, secondaryButtonClass } from "@/components/ui";
import { publicMediaUrl } from "@/lib/media";
import { formatPEN } from "@/lib/money";
import { getPublicBarbershop } from "@/lib/public-barbershop";
import { resolveBarbershopSlug } from "@/lib/network";
import { WEEKDAYS } from "@/lib/validation/hours";
import { SOCIAL_PLATFORMS } from "@/lib/validation/page";
import { formatPhone, isMobile } from "@/lib/validation/phone";

// Un slug anterior redirige (308) al actual; si no, la página no existe.
async function redirectOldSlug(slug: string): Promise<never> {
  const current = await resolveBarbershopSlug(slug);
  if (current) permanentRedirect(`/b/${current}`);
  notFound();
}

function summary(text: string | null, fallback: string): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length === 0) return fallback;
  return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
}

export async function generateMetadata({ params }: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getPublicBarbershop(slug);
  if (!shop) return redirectOldSlug(slug);

  const description = summary(shop.description, `${shop.name}: servicios, precios, horario y ubicación.`);
  return {
    title: shop.name,
    description,
    openGraph: {
      title: shop.name,
      description,
      type: "website",
      locale: "es_PE",
      images: shop.coverPath ? [{ url: publicMediaUrl(shop.coverPath) }] : undefined,
    },
  };
}

function formatTime(value: string): string {
  return value.replace(/^0(\d)/, "$1");
}

export default async function PublicBarbershopPage({ params }: PageProps<"/b/[slug]">) {
  const { slug } = await params;
  const shop = await getPublicBarbershop(slug);
  if (!shop) return redirectOldSlug(slug);

  const location = [shop.address, shop.district, shop.city].filter(Boolean).join(", ");
  const phoneDigits = shop.phone?.replace(/^\+/, "");
  const labelFor = (platform: string) => SOCIAL_PLATFORMS.find((p) => p.platform === platform)?.label ?? platform;

  return (
    <main id="main-content" tabIndex={-1} className="app-content mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 bg-white pb-12 shadow-[0_16px_45px_-30px_#172c2635]">
      <header className="flex flex-col">
        {shop.coverPath ? (
          <div className="relative aspect-[2/1] w-full overflow-hidden bg-brand-soft sm:rounded-b-lg">
            <Image src={publicMediaUrl(shop.coverPath)} alt="" fill priority sizes="(min-width: 672px) 672px, 100vw" className="object-cover" />
          </div>
        ) : null}
        <div className="flex items-center gap-4 px-4 pt-6">
          {shop.logoPath ? (
            <Image
              src={publicMediaUrl(shop.logoPath)}
              alt={`Logo de ${shop.name}`}
              width={72}
              height={72}
              className="size-18 shrink-0 rounded-full border border-brand-line object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{shop.name}</h1>
            {location ? <p className="text-brand-muted">{location}</p> : null}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-2 px-4 sm:flex-row">
        {shop.mapsUrl ? (
          <a href={shop.mapsUrl} target="_blank" rel="noopener noreferrer" className={`${buttonClass} sm:w-auto`}>
            Cómo llegar
          </a>
        ) : null}
        {shop.phone && phoneDigits ? (
          isMobile(shop.phone) ? (
            <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer" className={`${secondaryButtonClass} sm:w-auto`}>
              WhatsApp {formatPhone(shop.phone)}
            </a>
          ) : (
            <a href={`tel:${shop.phone}`} className={`${secondaryButtonClass} sm:w-auto`}>
              Llamar {formatPhone(shop.phone)}
            </a>
          )
        ) : null}
      </div>

      {shop.description ? (
        <section className="px-4">
          <h2 className="sr-only">Sobre nosotros</h2>
          <p className="whitespace-pre-line">{shop.description}</p>
        </section>
      ) : null}

      {shop.loyaltyText ? (
        <section aria-labelledby="loyalty-heading" className="mx-4 flex flex-col gap-1 rounded-xl border-2 border-brand-ink p-4">
          <h2 id="loyalty-heading" className="text-sm font-medium tracking-wide text-brand-muted uppercase">
            Premio por fidelidad
          </h2>
          <p className="text-lg font-semibold">{shop.loyaltyText}</p>
        </section>
      ) : null}

      {shop.services.length > 0 ? (
        <section aria-labelledby="services-heading" className="flex flex-col gap-3 px-4">
          <h2 id="services-heading" className="text-xl font-semibold">
            Servicios
          </h2>
          <ul className="flex flex-col divide-y divide-brand-line">
            {shop.services.map((service, index) => (
              <li key={index} className="flex justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{service.name}</p>
                  {service.description ? (
                    <p className="text-sm text-brand-muted">{service.description}</p>
                  ) : null}
                  {service.durationMinutes ? (
                    <p className="text-sm text-brand-muted">{service.durationMinutes} min</p>
                  ) : null}
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{formatPEN(service.price)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {shop.hours.length > 0 || shop.hoursNote ? (
        <section aria-labelledby="hours-heading" className="flex flex-col gap-3 px-4">
          <h2 id="hours-heading" className="text-xl font-semibold">
            Horario
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
            {WEEKDAYS.map(({ weekday, label }) => {
              const ranges = shop.hours.filter((h) => h.weekday === weekday);
              return (
                <div key={weekday} className="contents">
                  <dt className="font-medium">{label}</dt>
                  <dd className="text-brand-hover">
                    {ranges.length === 0
                      ? "Cerrado"
                      : ranges.map((r) => `${formatTime(r.opensAt)}–${formatTime(r.closesAt)}`).join(" y ")}
                  </dd>
                </div>
              );
            })}
          </dl>
          {shop.hoursNote ? <p className="text-sm text-brand-muted">{shop.hoursNote}</p> : null}
        </section>
      ) : null}

      {shop.photos.length > 0 ? (
        <section aria-labelledby="gallery-heading" className="flex flex-col gap-3 px-4">
          <h2 id="gallery-heading" className="text-xl font-semibold">
            Galería
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shop.photos.map((photo, index) => (
              <li key={photo.path}>
                <figure className="flex flex-col gap-1">
                  <Image
                    src={publicMediaUrl(photo.path)}
                    alt={photo.caption ?? `Foto ${index + 1} de ${shop.name}`}
                    width={400}
                    height={400}
                    sizes="(min-width: 640px) 220px, 50vw"
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                  {photo.caption ? <figcaption className="text-sm text-brand-muted">{photo.caption}</figcaption> : null}
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {shop.socialLinks.length > 0 ? (
        <section aria-labelledby="social-heading" className="flex flex-col gap-3 px-4">
          <h2 id="social-heading" className="text-xl font-semibold">
            Síguenos
          </h2>
          <ul className="flex flex-wrap gap-2">
            {shop.socialLinks.map((link) => (
              <li key={link.platform}>
                <a href={link.url} target="_blank" rel="noopener noreferrer" className={`${secondaryButtonClass} sm:w-auto`}>
                  {labelFor(link.platform)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
