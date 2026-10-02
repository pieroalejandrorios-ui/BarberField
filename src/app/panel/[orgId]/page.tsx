import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { startOfTodayInLima } from "@/lib/dates";
import { requireMembership, requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Panel · Barber Field" };

const PENDING_LIMIT = 10;

export default async function BusinessPage({ params }: PageProps<"/panel/[orgId]">) {
  const { orgId } = await params;
  const business = await requireMembership(orgId);
  const isOwner = business.role === "owner";
  const { supabase } = await requireUser();

  const [programResult, todayResult, pendingResult] = await Promise.all([
    supabase.from("loyalty_programs").select("status").eq("organization_id", business.id).maybeSingle(),
    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", business.id)
      .eq("status", "completed")
      .gte("visited_at", startOfTodayInLima()),
    supabase
      .from("rewards")
      .select("customer_id, issued_at")
      .eq("organization_id", business.id)
      .eq("status", "available")
      .order("issued_at")
      .limit(50),
  ]);
  if (programResult.error || todayResult.error || pendingResult.error) {
    throw new Error("No se pudo cargar el resumen.");
  }

  const pendingCustomerIds = [...new Set(pendingResult.data.map((reward) => reward.customer_id))].slice(0, PENDING_LIMIT);
  const customersResult = pendingCustomerIds.length
    ? await supabase
        .from("customers")
        .select("id, full_name")
        .eq("organization_id", business.id)
        .in("id", pendingCustomerIds)
        .order("full_name")
    : { data: [], error: null };
  if (customersResult.error) throw new Error("No se pudo cargar el resumen.");

  const program = programResult.data;

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{business.name}</h1>

      {program ? (
        <Link href={`/panel/${business.id}/visitas/nueva`} className={`${buttonClass} sm:w-auto`}>
          Registrar visita
        </Link>
      ) : (
        <p role="status" className="rounded-xl bg-amber-50 p-4 text-amber-900">
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
      )}
      {program?.status === "paused" ? (
        <p className="text-sm text-brand-muted">La promoción está pausada: las visitas no suman.</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-brand-line p-4">
          <dt className="text-sm text-brand-muted">Visitas de hoy</dt>
          <dd className="text-2xl font-semibold tabular-nums">{todayResult.count ?? 0}</dd>
        </div>
        <div className="rounded-xl border border-brand-line p-4">
          <dt className="text-sm text-brand-muted">Clientes con premio pendiente</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {new Set(pendingResult.data.map((reward) => reward.customer_id)).size}
            {pendingResult.data.length === 50 ? "+" : ""}
          </dd>
        </div>
      </dl>

      {customersResult.data.length > 0 ? (
        <section aria-labelledby="pending-heading" className="flex flex-col gap-2">
          <h2 id="pending-heading" className="text-lg font-semibold">
            Premios pendientes
          </h2>
          <ul className="flex flex-col divide-y divide-brand-line rounded-xl border border-brand-line">
            {customersResult.data.map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`/panel/${business.id}/clientes/${customer.id}`}
                  className="flex min-h-11 items-center px-4 py-2 font-medium hover:bg-brand-canvas focus-visible:outline-2 focus-visible:outline-brand-ink"
                >
                  {customer.full_name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : <EmptyState title="No hay premios pendientes" description="Cuando un cliente gane un premio y lo deje para otra visita, aparecerá aquí." />}

      <ul className="flex flex-col gap-2">
        <li>
          <Link href={`/panel/${business.id}/clientes/nuevo`} className="font-medium underline">
            Registrar un cliente
          </Link>
        </li>
        <li>
          <Link href={`/panel/${business.id}/servicios`} className="font-medium underline">
            {isOwner ? "Administra tus servicios y precios" : "Consulta los servicios y precios"}
          </Link>
        </li>
        {isOwner ? (
          <>
            <li>
              <Link href={`/panel/${business.id}/premio`} className="font-medium underline">
                Configura el premio por fidelidad
              </Link>
            </li>
            <li>
              <Link href={`/panel/${business.id}/pagina`} className="font-medium underline">
                Personaliza y publica tu página
              </Link>
            </li>
            <li>
              <Link href={`/panel/${business.id}/equipo`} className="font-medium underline">
                Agrega a tus trabajadores
              </Link>
            </li>
          </>
        ) : null}
      </ul>
    </section>
  );
}
