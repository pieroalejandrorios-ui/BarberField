import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { secondaryButtonClass } from "@/components/ui";
import { getCustomerLoyalty } from "@/lib/customer-loyalty";
import { formatDateTime } from "@/lib/dates";
import { describeReward } from "@/lib/loyalty";
import { formatPEN } from "@/lib/money";
import { requireMembership, requireUser, type Business } from "@/lib/session";
import { formatPhone } from "@/lib/validation/phone";
import { isUuid } from "@/lib/validation/uuid";
import { VisitForm } from "./visit-form";

export const metadata: Metadata = { title: "Registrar visita · Barber Field" };

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Paso 1: buscar al cliente (o registrarlo).
async function CustomerPicker({ business, query }: { business: Business; query: string }) {
  const { supabase } = await requireUser();
  const base = `/panel/${business.id}/visitas/nueva`;

  let results: Array<{ id: string; full_name: string; dni: string; phone: string }> = [];
  if (query) {
    const { data, error } = await supabase.rpc("search_customers", {
      p_organization_id: business.id,
      p_query: query,
      p_limit: 10,
    });
    if (error) throw new Error("No se pudieron buscar los clientes.");
    results = data;
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Registrar visita</h1>
      <form method="get" action={base} role="search" className="flex flex-col gap-2">
        <label htmlFor="q" className="text-sm font-medium">
          Busca al cliente por nombre, DNI o celular
        </label>
        <div className="flex gap-2">
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            maxLength={120}
            autoComplete="off"
            autoFocus
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-brand-line bg-white px-3 py-2 text-base text-brand-ink"
          />
          <button type="submit" className={`${secondaryButtonClass} w-auto`}>
            Buscar
          </button>
        </div>
      </form>

      {query ? (
        results.length === 0 ? (
          <p className="text-brand-muted">No hay clientes que coincidan con la búsqueda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-brand-line rounded-xl border border-brand-line">
            {results.map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`${base}?cliente=${customer.id}`}
                  className="flex min-h-14 flex-col gap-0.5 px-4 py-3 hover:bg-brand-canvas focus-visible:outline-2 focus-visible:outline-brand-ink"
                >
                  <span className="font-medium">{customer.full_name}</span>
                  <span className="text-sm text-brand-muted">
                    DNI {customer.dni} · {formatPhone(customer.phone)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <Link href={`/panel/${business.id}/clientes/nuevo`} className="font-medium underline">
        ¿Cliente nuevo? Regístralo primero
      </Link>
    </section>
  );
}

export default async function NewVisitPage({ params, searchParams }: PageProps<"/panel/[orgId]/visitas/nueva">) {
  const { orgId } = await params;
  const query = await searchParams;
  const business = await requireMembership(orgId);
  const isOwner = business.role === "owner";

  const customerId = firstParam(query.cliente);
  if (!customerId) {
    return <CustomerPicker business={business} query={firstParam(query.q).trim().slice(0, 120)} />;
  }
  if (!isUuid(customerId)) notFound();

  const { supabase, userId } = await requireUser();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, full_name, dni, archived_at")
    .eq("organization_id", business.id)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar el cliente.");
  if (!customer) notFound();

  const [loyalty, servicesResult, teamResult] = await Promise.all([
    getCustomerLoyalty(customer.id),
    supabase
      .from("services")
      .select("id, name, price")
      .eq("organization_id", business.id)
      .is("archived_at", null)
      .order("sort_order")
      .order("created_at"),
    supabase.rpc("list_team", { p_organization_id: business.id }),
  ]);
  if (servicesResult.error || teamResult.error) throw new Error("No se pudo preparar el registro de la visita.");

  const customerHref = `/panel/${business.id}/clientes/${customer.id}`;
  const header = (
    <div className="flex flex-col gap-1">
      <Link href={`/panel/${business.id}/visitas/nueva`} className="text-sm underline">
        ← Elegir otro cliente
      </Link>
      <h1 className="text-2xl font-semibold">Registrar visita</h1>
      <p>
        <Link href={customerHref} className="font-medium underline">
          {customer.full_name}
        </Link>{" "}
        <span className="text-brand-muted">· DNI {customer.dni}</span>
      </p>
    </div>
  );

  if (customer.archived_at) {
    return (
      <section className="flex flex-col gap-4">
        {header}
        <p role="alert" className="rounded-xl bg-brand-soft p-3">
          Este cliente está archivado y no puede recibir visitas nuevas.
        </p>
      </section>
    );
  }

  if (!loyalty.configured) {
    return (
      <section className="flex flex-col gap-4">
        {header}
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900">
          {isOwner ? (
            <>
              Configura tu premio por fidelidad para empezar a registrar visitas.{" "}
              <Link href={`/panel/${business.id}/premio`} className="font-medium underline">
                Configurar premio
              </Link>
            </>
          ) : (
            "El dueño aún no configuró el premio, así que todavía no se pueden registrar visitas."
          )}
        </p>
      </section>
    );
  }

  const services = servicesResult.data.map((service) => ({
    id: service.id,
    name: service.name,
    // `numeric(10,2)` llega como número JSON; se muestra con 2 decimales.
    price: service.price.toFixed(2),
  }));
  if (services.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        {header}
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900">
          {isOwner ? (
            <>
              Agrega al menos un servicio para registrar visitas.{" "}
              <Link href={`/panel/${business.id}/servicios`} className="font-medium underline">
                Ir a servicios
              </Link>
            </>
          ) : (
            "El dueño aún no agregó servicios."
          )}
        </p>
      </section>
    );
  }

  const members = teamResult.data
    .filter((member) => member.is_active)
    .map((member) => ({ userId: member.user_id, email: member.email }));
  const counts = loyalty.programStatus === "active" && loyalty.visitsRequired !== null;

  return (
    <section className="flex flex-col gap-6">
      {header}

      <div className="flex flex-col gap-1 rounded-xl border border-brand-line p-4">
        {counts ? (
          <p className="text-lg font-semibold">
            Visita {loyalty.progress + 1} de {loyalty.visitsRequired}
          </p>
        ) : (
          <p className="font-semibold">La promoción está pausada: esta visita no suma.</p>
        )}
        {loyalty.reward && counts ? (
          <p className="text-sm text-brand-muted">Premio: {describeReward(loyalty.reward)}</p>
        ) : null}
        <p className="text-sm text-brand-muted">
          {loyalty.lastVisit
            ? `Última visita: ${formatDateTime(loyalty.lastVisit.visitedAt)} · ${formatPEN(loyalty.lastVisit.total)}`
            : "Es su primera visita."}
        </p>
      </div>

      <VisitForm
        key={`${business.id}:${customer.id}`}
        organizationId={business.id}
        customerId={customer.id}
        services={services}
        members={members}
        currentUserId={userId}
        nextVisitCompletes={loyalty.nextVisitCompletes}
        visitsRequired={loyalty.visitsRequired}
        earnedReward={loyalty.reward}
        pendingRewards={loyalty.availableRewards}
      />
    </section>
  );
}
