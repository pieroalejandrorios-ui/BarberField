import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { buttonClass, secondaryButtonClass } from "@/components/ui";
import { getCustomerLoyalty } from "@/lib/customer-loyalty";
import { formatDate, formatDateTime } from "@/lib/dates";
import { describeReward } from "@/lib/loyalty";
import { formatPEN } from "@/lib/money";
import { requireMembership, requireUser } from "@/lib/session";
import type { Tables } from "@/lib/supabase/database.types";
import { parsePageNumber } from "@/lib/validation/pagination";
import { formatPhone } from "@/lib/validation/phone";
import { isUuid } from "@/lib/validation/uuid";
import { setCustomerArchived } from "../actions";
import { EditCustomerForm } from "./edit-customer-form";

export const metadata: Metadata = { title: "Cliente · Barber Field" };

const VISITS_PAGE_SIZE = 10;

type RewardRow = Pick<
  Tables<"rewards">,
  | "id"
  | "status"
  | "issued_visit_id"
  | "redeemed_visit_id"
  | "reward_type"
  | "reward_service_name"
  | "reward_percent"
  | "reward_amount"
  | "reward_description"
>;

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function rewardLabel(reward: RewardRow): string {
  return describeReward({
    type: reward.reward_type,
    serviceName: reward.reward_service_name,
    percent: reward.reward_percent === null ? null : reward.reward_percent.toFixed(2),
    amount: reward.reward_amount === null ? null : reward.reward_amount.toFixed(2),
    description: reward.reward_description,
  });
}

export default async function CustomerPage({ params, searchParams }: PageProps<"/panel/[orgId]/clientes/[customerId]">) {
  const { orgId, customerId } = await params;
  const query = await searchParams;
  const business = await requireMembership(orgId);
  if (!isUuid(customerId)) notFound();

  const { supabase } = await requireUser();
  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, full_name, dni, phone, email, consent_at, created_at, archived_at")
    .eq("organization_id", business.id)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar el cliente.");
  if (!customer) notFound();

  const pageNumber = parsePageNumber(firstParam(query.pagina), VISITS_PAGE_SIZE);
  const offset = (pageNumber - 1) * VISITS_PAGE_SIZE;
  const registeredVisitId = firstParam(query.visita);
  const change = firstParam(query.cambio);

  const [loyalty, visitsResult, rewardsResult, teamResult] = await Promise.all([
    getCustomerLoyalty(customer.id),
    supabase
      .from("visits")
      .select("id, visited_at, customer_seq, subtotal, discount_total, total, status, attended_by", { count: "exact" })
      .eq("organization_id", business.id)
      .eq("customer_id", customer.id)
      .order("customer_seq", { ascending: false })
      .range(offset, offset + VISITS_PAGE_SIZE - 1),
    supabase
      .from("rewards")
      .select("id, status, issued_visit_id, redeemed_visit_id, reward_type, reward_service_name, reward_percent, reward_amount, reward_description")
      .eq("organization_id", business.id)
      .eq("customer_id", customer.id),
    supabase.rpc("list_team", { p_organization_id: business.id }),
  ]);
  if (visitsResult.error || rewardsResult.error || teamResult.error) {
    throw new Error("No se pudo cargar el historial del cliente.");
  }

  const visits = visitsResult.data;
  const rewards = rewardsResult.data;
  const emails = new Map(teamResult.data.map((member) => [member.user_id, member.email]));

  const visitIds = visits.map((visit) => visit.id);
  const itemsResult = visitIds.length
    ? await supabase
        .from("visit_items")
        .select("visit_id, service_name, quantity, net, position")
        .eq("organization_id", business.id)
        .in("visit_id", visitIds)
        .order("position")
    : { data: [], error: null };
  if (itemsResult.error) throw new Error("No se pudo cargar el historial del cliente.");
  const itemsByVisit = new Map<string, typeof itemsResult.data>();
  for (const item of itemsResult.data) {
    itemsByVisit.set(item.visit_id, [...(itemsByVisit.get(item.visit_id) ?? []), item]);
  }

  const totalVisits = visitsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalVisits / VISITS_PAGE_SIZE));
  const base = `/panel/${business.id}/clientes/${customer.id}`;
  const pageHref = (page: number) => (page > 1 ? `${base}?pagina=${page}` : base);
  if (pageNumber > totalPages) redirect(pageHref(totalPages));

  const isOwner = business.role === "owner";
  const phoneDigits = customer.phone.replace(/^\+/, "");
  const canRegister = customer.archived_at === null && loyalty.configured;

  // Confirmación tras registrar una visita.
  const registeredReward = isUuid(registeredVisitId)
    ? {
        issued: rewards.find((r) => r.issued_visit_id === registeredVisitId),
        redeemed: rewards.find((r) => r.redeemed_visit_id === registeredVisitId),
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      {change === "corregida" || change === "anulada" ? <p role="status" className="rounded-xl bg-green-50 p-4 text-green-900">Visita {change} correctamente.</p> : null}
      <Link href={`/panel/${business.id}/clientes`} className="text-sm underline">
        ← Clientes
      </Link>

      {registeredReward ? (
        <div role="status" className="flex flex-col gap-1 rounded-xl bg-green-50 p-4 text-green-900">
          <p className="font-semibold">Visita registrada.</p>
          {registeredReward.redeemed ? <p>Se aplicó el premio «{rewardLabel(registeredReward.redeemed)}».</p> : null}
          {registeredReward.issued?.status === "available" ? (
            <p>Ganó el premio «{rewardLabel(registeredReward.issued)}»; quedó pendiente para otra visita.</p>
          ) : null}
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{customer.full_name}</h1>
        {customer.archived_at ? (
          <p className="rounded-xl bg-brand-soft p-3 text-sm">
            Cliente archivado el {formatDate(customer.archived_at)}. No puede recibir visitas nuevas.
          </p>
        ) : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
          <dt className="text-brand-muted">DNI</dt>
          <dd>{customer.dni}</dd>
          <dt className="text-brand-muted">Celular</dt>
          <dd>
            <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer" className="underline">
              {formatPhone(customer.phone)}
            </a>
          </dd>
          {customer.email ? (
            <>
              <dt className="text-brand-muted">Correo</dt>
              <dd className="break-all">{customer.email}</dd>
            </>
          ) : null}
          <dt className="text-brand-muted">Registrado</dt>
          <dd>{formatDate(customer.created_at)}</dd>
          <dt className="text-brand-muted">Autorización</dt>
          <dd>{formatDate(customer.consent_at)}</dd>
        </dl>
        {canRegister ? (
          <Link href={`/panel/${business.id}/visitas/nueva?cliente=${customer.id}`} className={`${buttonClass} mt-2 sm:w-auto`}>
            Registrar visita
          </Link>
        ) : null}
      </section>

      <section aria-labelledby="loyalty-heading" className="flex flex-col gap-3 rounded-xl border border-brand-line p-4">
        <h2 id="loyalty-heading" className="text-lg font-semibold">
          Premio por fidelidad
        </h2>
        {!loyalty.configured ? (
          <p className="text-brand-muted">
            {isOwner ? (
              <>
                Configura tu premio por fidelidad para empezar a registrar visitas.{" "}
                <Link href={`/panel/${business.id}/premio`} className="font-medium underline">
                  Configurar premio
                </Link>
              </>
            ) : (
              "El dueño aún no configuró el premio."
            )}
          </p>
        ) : (
          <>
            {loyalty.visitsRequired !== null ? (
              <div className="flex flex-col gap-2">
                <p className="text-xl font-semibold">
                  {loyalty.progress} de {loyalty.visitsRequired} visitas
                </p>
                <progress
                  value={loyalty.progress}
                  max={loyalty.visitsRequired}
                  aria-label="Progreso hacia el premio"
                  className="h-3 w-full overflow-hidden rounded-full accent-brand-ink"
                />
                {loyalty.reward ? (
                  <p className="text-sm text-brand-muted">Premio: {describeReward(loyalty.reward)}</p>
                ) : null}
                {loyalty.nextVisitCompletes ? <p className="font-medium">¡La próxima visita gana el premio!</p> : null}
              </div>
            ) : null}
            {loyalty.programStatus === "paused" ? (
              <p className="text-sm text-brand-muted">La promoción está pausada: las visitas no suman.</p>
            ) : null}
            {loyalty.availableRewards.length > 0 ? (
              <div className="flex flex-col gap-1 rounded-xl bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">Premios pendientes</p>
                <ul className="list-inside list-disc">
                  {loyalty.availableRewards.map((reward) => (
                    <li key={reward.id}>
                      {describeReward(reward)} · ganado el {formatDate(reward.issuedAt)}
                    </li>
                  ))}
                </ul>
                <p className="text-sm">Se aplican al registrar una visita.</p>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-lg font-semibold">
          Historial de visitas
        </h2>
        {visits.length === 0 ? (
          <p className="text-brand-muted">Todavía no tiene visitas.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-brand-line rounded-xl border border-brand-line">
            {visits.map((visit) => {
              const redeemed = rewards.find((r) => r.redeemed_visit_id === visit.id);
              const issued = rewards.find((r) => r.issued_visit_id === visit.id);
              const voided = visit.status === "voided";
              return (
                <li key={visit.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-medium">
                      Visita {visit.customer_seq} · {formatDateTime(visit.visited_at)}
                      {voided ? <span className="ml-2 text-sm font-normal text-red-700 ">(anulada)</span> : null}
                    </p>
                    <p className={`font-semibold tabular-nums ${voided ? "line-through" : ""}`}>{formatPEN(visit.total)}</p>
                  </div>
                  <ul className="text-sm text-brand-hover">
                    {(itemsByVisit.get(visit.id) ?? []).map((item) => (
                      <li key={item.position}>
                        {item.quantity > 1 ? `${item.quantity} × ` : ""}
                        {item.service_name} · {formatPEN(item.net)}
                      </li>
                    ))}
                  </ul>
                  {redeemed ? (
                    <p className="text-sm">
                      Premio aplicado: {rewardLabel(redeemed)}
                      {visit.discount_total > 0 ? ` (− ${formatPEN(visit.discount_total)})` : ""}
                    </p>
                  ) : null}
                  {issued ? (
                    <p className="text-sm">
                      Completó el premio{issued.status === "available" ? " (pendiente)" : ""}.
                    </p>
                  ) : null}
                  <p className="text-sm text-brand-muted">
                    Atendido por {emails.get(visit.attended_by) ?? "un miembro anterior"}
                  </p>
                  {!voided ? <Link href={`/panel/${business.id}/visitas/${visit.id}/corregir`} className="inline-flex min-h-11 items-center text-sm underline">Corregir o anular visita</Link> : null}
                </li>
              );
            })}
          </ul>
        )}
        {totalPages > 1 ? (
          <nav aria-label="Páginas del historial" className="flex items-center justify-between gap-3">
            {pageNumber > 1 ? (
              <Link href={pageHref(pageNumber - 1)} className={`${secondaryButtonClass} w-auto`}>
                Más recientes
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-brand-muted">
              Página {Math.min(pageNumber, totalPages)} de {totalPages}
            </span>
            {pageNumber < totalPages ? (
              <Link href={pageHref(pageNumber + 1)} className={`${secondaryButtonClass} w-auto`}>
                Anteriores
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>

      {isOwner ? (
        <section aria-labelledby="edit-heading" className="flex flex-col gap-4 rounded-xl border border-brand-line p-4">
          <h2 id="edit-heading" className="text-lg font-semibold">
            Editar datos
          </h2>
          <EditCustomerForm
            organizationId={business.id}
            customerId={customer.id}
            initialValues={{
              fullName: customer.full_name,
              dni: customer.dni,
              phone: formatPhone(customer.phone),
              email: customer.email ?? "",
            }}
          />
          <ActionButton
            action={setCustomerArchived.bind(null, business.id, customer.id, customer.archived_at === null)}
            label={customer.archived_at ? "Restaurar cliente" : "Archivar cliente"}
          />
        </section>
      ) : null}
    </div>
  );
}
