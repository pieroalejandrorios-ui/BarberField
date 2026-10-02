import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass, secondaryButtonClass } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { requireMembership, requireUser } from "@/lib/session";
import { formatPhone } from "@/lib/validation/phone";
import { parsePageNumber } from "@/lib/validation/pagination";

export const metadata: Metadata = { title: "Clientes · Barber Field" };

const PAGE_SIZE = 20;

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function CustomersPage({ params, searchParams }: PageProps<"/panel/[orgId]/clientes">) {
  const { orgId } = await params;
  const query = await searchParams;
  const business = await requireMembership(orgId);
  const isOwner = business.role === "owner";

  const q = firstParam(query.q).trim().slice(0, 120);
  const pageNumber = parsePageNumber(firstParam(query.pagina), PAGE_SIZE);
  // Solo el dueño puede ver archivados (la función también lo exige).
  const includeArchived = isOwner && firstParam(query.archivados) === "1";

  const { supabase } = await requireUser();
  const { data: customers, error } = await supabase.rpc("search_customers", {
    p_organization_id: business.id,
    p_query: q,
    p_include_archived: includeArchived,
    p_limit: PAGE_SIZE,
    p_offset: (pageNumber - 1) * PAGE_SIZE,
  });
  if (error) throw new Error("No se pudieron cargar los clientes.");

  const total = customers[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = `/panel/${business.id}/clientes`;
  const pageHref = (page: number) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (includeArchived) search.set("archivados", "1");
    if (page > 1) search.set("pagina", String(page));
    const text = search.toString();
    return text ? `${base}?${text}` : base;
  };

  // Una URL antigua o el archivado de registros puede dejar esta página vacía.
  // La RPC no devuelve total_count sin filas: volver al inicio evita perder
  // la navegación y mostrar incorrectamente que no existen clientes.
  if (customers.length === 0 && pageNumber > 1) redirect(pageHref(1));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Link href={`${base}/nuevo`} className={`${buttonClass} sm:w-auto`}>
          Nuevo cliente
        </Link>
      </div>

      <form method="get" action={base} role="search" className="flex flex-col gap-3">
        <label htmlFor="q" className="text-sm font-medium">
          Buscar por nombre, DNI o celular
        </label>
        <div className="flex gap-2">
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={120}
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-brand-line bg-white px-3 py-2 text-base text-brand-ink"
          />
          <button type="submit" className={`${secondaryButtonClass} w-auto`}>
            Buscar
          </button>
        </div>
        {isOwner ? (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="archivados" value="1" defaultChecked={includeArchived} className="size-5 accent-brand-ink" />
            Incluir archivados
          </label>
        ) : null}
      </form>

      {customers.length === 0 ? (
        <EmptyState title={q ? "No encontramos coincidencias" : "Aquí empieza el historial de tus clientes"}
          description={q ? "Prueba con otro nombre, DNI o celular, o vuelve a la lista completa." : "Registra a tu primer cliente con su autorización para empezar a llevar sus visitas."}
          action={q ? { href: base, label: "Ver todos los clientes" } : { href: `${base}/nuevo`, label: "Registrar primer cliente" }} />
      ) : (
        <ul className="flex flex-col divide-y divide-brand-line rounded-xl border border-brand-line">
          {customers.map((customer) => (
            <li key={customer.id}>
              <Link
                href={`${base}/${customer.id}`}
                className="flex min-h-14 flex-col gap-0.5 px-4 py-3 hover:bg-brand-canvas focus-visible:outline-2 focus-visible:outline-brand-ink"
              >
                <span className="font-medium">
                  {customer.full_name}
                  {customer.archived_at ? <span className="ml-2 text-sm font-normal text-brand-muted">(archivado)</span> : null}
                </span>
                <span className="text-sm text-brand-muted">
                  DNI {customer.dni} · {formatPhone(customer.phone)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
          {pageNumber > 1 ? (
            <Link href={pageHref(pageNumber - 1)} className={`${secondaryButtonClass} w-auto`}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-brand-muted">
            Página {Math.min(pageNumber, totalPages)} de {totalPages}
          </span>
          {pageNumber < totalPages ? (
            <Link href={pageHref(pageNumber + 1)} className={`${secondaryButtonClass} w-auto`}>
              Siguiente
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}
