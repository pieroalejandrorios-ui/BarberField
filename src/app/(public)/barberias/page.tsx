import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { BarbershopCard } from "@/components/barbershop-card";
import { EmptyState } from "@/components/empty-state";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { buttonClass, secondaryButtonClass } from "@/components/ui";
import {
  NETWORK_PAGE_SIZE,
  NETWORK_QUERY_MAX_LENGTH,
  NETWORK_ROW_SIZE,
  listNetworkBarbershops,
  listNetworkDistricts,
  type NetworkCard,
} from "@/lib/network";
import { NETWORK_SEED_COOKIE, isNetworkSeed } from "@/lib/network-seed";
import { getOptionalUserId } from "@/lib/session";

export const metadata: Metadata = {
  title: "Barberías · Barber Field",
  description: "Encuentra barberías por nombre, distrito o servicio: precios, horarios, fotos y ubicación.",
};

type Params = { q: string; distrito: string; ver: "todas" | "nuevas" | null; pagina: number };

function readParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function readParams(raw: Record<string, string | string[] | undefined>): Params {
  const ver = readParam(raw.ver);
  const page = Number.parseInt(readParam(raw.pagina), 10);
  return {
    q: readParam(raw.q).slice(0, NETWORK_QUERY_MAX_LENGTH),
    distrito: readParam(raw.distrito).slice(0, 80),
    ver: ver === "todas" || ver === "nuevas" ? ver : null,
    pagina: Number.isInteger(page) && page >= 1 && page <= 400 ? page : 1,
  };
}

function href(params: Partial<Params>): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.distrito) search.set("distrito", params.distrito);
  if (params.ver) search.set("ver", params.ver);
  if (params.pagina && params.pagina > 1) search.set("pagina", String(params.pagina));
  const query = search.toString();
  return query ? `/barberias?${query}` : "/barberias";
}

function Row({ id, title, cards, more, now }: { id: string; title: string; cards: NetworkCard[]; more: string; now: Date }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4 px-5 sm:px-8">
        <h2 id={id} className="text-2xl font-semibold tracking-tight">{title}</h2>
        <Link href={more} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold underline underline-offset-4">
          Ver todas<span className="sr-only"> en {title}</span>
        </Link>
      </div>
      <ul className="flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-4 sm:scroll-px-8 sm:px-8">
        {cards.map((card) => (
          <li key={card.slug} className="w-[17rem] shrink-0 snap-start sm:w-[19rem]">
            <BarbershopCard card={card} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function NetworkPage({ searchParams }: PageProps<"/barberias">) {
  const params = readParams(await searchParams);
  const cookieSeed = (await cookies()).get(NETWORK_SEED_COOKIE)?.value;
  const seed = isNetworkSeed(cookieSeed) ? cookieSeed : "barber-field";
  const now = new Date();
  const signedIn = (await getOptionalUserId()) !== null;
  const isGrid = Boolean(params.q || params.distrito || params.ver);

  let content: ReactNode;

  if (isGrid) {
    const offset = (params.pagina - 1) * NETWORK_PAGE_SIZE;
    const { cards, total } = await listNetworkBarbershops({
      seed,
      query: params.q,
      district: params.distrito || null,
      sort: params.ver === "nuevas" ? "newest" : "random",
      offset,
    });
    const title = params.q
      ? `Resultados para «${params.q}»`
      : params.distrito
        ? `Barberías en ${params.distrito}`
        : params.ver === "nuevas"
          ? "Nuevas en Barber Field"
          : "Todas las barberías";
    const pages = Math.max(1, Math.ceil(total / NETWORK_PAGE_SIZE));

    content = (
      <section aria-labelledby="results-heading" className="mx-auto flex max-w-6xl flex-col gap-5 px-5 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="results-heading" className="text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="text-sm text-brand-muted" role="status">
              {total === 1 ? "1 barbería" : `${total} barberías`}
              {params.q && params.distrito ? ` en ${params.distrito}` : ""}
            </p>
          </div>
          <Link href="/barberias" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
            Volver a explorar
          </Link>
        </div>
        {cards.length === 0 ? (
          <EmptyState
            title="No encontramos barberías"
            description="Prueba con otro nombre, distrito o servicio, o vuelve a explorar todas."
            action={{ href: "/barberias", label: "Ver todas las barberías" }}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <li key={card.slug}><BarbershopCard card={card} now={now} /></li>
            ))}
          </ul>
        )}
        {pages > 1 ? (
          <nav aria-label="Páginas de resultados" className="flex items-center justify-between gap-3">
            {params.pagina > 1 ? (
              <Link href={href({ ...params, pagina: params.pagina - 1 })} className={`${secondaryButtonClass} sm:w-auto`}>Anterior</Link>
            ) : <span />}
            <span className="text-sm text-brand-muted">Página {Math.min(params.pagina, pages)} de {pages}</span>
            {params.pagina < pages ? (
              <Link href={href({ ...params, pagina: params.pagina + 1 })} className={`${secondaryButtonClass} sm:w-auto`}>Siguiente</Link>
            ) : <span />}
          </nav>
        ) : null}
      </section>
    );
  } else {
    const [discover, newest, districts] = await Promise.all([
      listNetworkBarbershops({ seed, limit: NETWORK_ROW_SIZE }),
      listNetworkBarbershops({ seed, sort: "newest", limit: NETWORK_ROW_SIZE }),
      listNetworkDistricts(6),
    ]);
    const districtRows = await Promise.all(
      districts.map(async ({ district }) => ({
        district,
        cards: (await listNetworkBarbershops({ seed, district, limit: NETWORK_ROW_SIZE })).cards,
      })),
    );

    content = discover.total === 0 ? (
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <EmptyState
          title="Pronto verás barberías aquí"
          description="Las barberías aparecen cuando publican su página con dirección y al menos dos servicios. ¿Tienes una barbería? Crea tu cuenta y publícala."
          action={{ href: "/registro", label: "Crear mi cuenta" }}
        />
      </div>
    ) : (
      <div className="flex flex-col gap-10">
        <Row id="row-discover" title="Descubre" cards={discover.cards} more={href({ ver: "todas" })} now={now} />
        <Row id="row-newest" title="Nuevas" cards={newest.cards} more={href({ ver: "nuevas" })} now={now} />
        {districtRows.map(({ district, cards }, index) =>
          cards.length > 0 ? (
            <Row key={district} id={`row-district-${index}`} title={`En ${district}`} cards={cards} more={href({ distrito: district })} now={now} />
          ) : null,
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-canvas text-brand-ink">
      <SiteHeader current="barberias" signedIn={signedIn} />
      <main id="main-content" tabIndex={-1} className="flex flex-col gap-10 pb-16">
        <section aria-labelledby="network-title" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 pt-10 sm:px-8 sm:pt-14">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] uppercase text-brand-leaf">Red de barberías</p>
            <h1 id="network-title" className="mt-2 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Encuentra tu barbería</h1>
            <p className="mt-3 max-w-xl text-brand-muted">Mira servicios, precios, horarios y fotos antes de ir.</p>
          </div>
          <form action="/barberias" method="get" role="search" className="flex w-full max-w-2xl flex-col gap-2 sm:flex-row">
            <label htmlFor="q" className="sr-only">Buscar por nombre, distrito o servicio</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={params.q}
              maxLength={NETWORK_QUERY_MAX_LENGTH}
              placeholder="Nombre, distrito o servicio"
              className="min-h-12 flex-1 rounded-xl border border-brand-line bg-white px-4 text-base focus:border-brand-ink focus:outline-2 focus:outline-brand-ink"
            />
            {params.distrito ? <input type="hidden" name="distrito" value={params.distrito} /> : null}
            <button type="submit" className={`${buttonClass} sm:w-auto`}>Buscar</button>
          </form>
        </section>
        {content}
      </main>
      <SiteFooter />
    </div>
  );
}
