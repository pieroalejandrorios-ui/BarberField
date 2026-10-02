import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { buttonClass } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { formatPEN } from "@/lib/money";
import { resolveReportPeriod, type ReportPeriodKind } from "@/lib/report-period";
import { parseBusinessReport, parseReportItems, type ReportAmounts } from "@/lib/reports";
import { requireOwner, requireUser } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { parsePageNumber } from "@/lib/validation/pagination";
import { isUuid } from "@/lib/validation/uuid";

export const metadata: Metadata = { title: "Reportes · Barber Field" };

const PAGE_SIZE = 20;
const PERIOD_OPTIONS: Array<{ value: ReportPeriodKind; label: string }> = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Semana actual" },
  { value: "mes", label: "Mes actual" },
  { value: "personalizado", label: "Fechas personalizadas" },
];
const selectClass =
  "min-h-11 rounded-xl border border-brand-line bg-white px-3 py-2 text-base text-brand-ink focus:border-brand-ink focus:outline-2 focus:outline-brand-ink";
const inputClass = selectClass;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function Metrics({ amounts }: { amounts: ReportAmounts }) {
  const items = [
    { label: "Visitas completadas", value: String(amounts.visits) },
    { label: "Unidades de servicios", value: String(amounts.serviceUnits) },
    { label: "Subtotal antes de descuentos", value: formatPEN(amounts.subtotal) },
    { label: "Descuentos aplicados", value: formatPEN(amounts.discountTotal) },
    { label: "Total de servicios registrados", value: formatPEN(amounts.total) },
  ];
  return <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    {items.map((item, index) => <div key={item.label}
      className={`rounded-xl border border-brand-line bg-white p-4 ${index === items.length - 1 ? "col-span-2 sm:col-span-1 border-brand-ink" : ""}`}>
      <dt className="text-sm text-brand-muted">{item.label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{item.value}</dd>
    </div>)}
  </dl>;
}

export default async function ReportsPage({ params, searchParams }: PageProps<"/panel/[orgId]/reportes">) {
  const { orgId } = await params;
  const business = await requireOwner(orgId);
  const query = await searchParams;
  const input = { periodo: first(query.periodo), desde: first(query.desde), hasta: first(query.hasta) };
  const memberParam = first(query.trabajador);
  const page = parsePageNumber(first(query.pagina), PAGE_SIZE);
  const { supabase } = await requireUser();

  // El dueño ve a todos los miembros, también a los desactivados.
  const team = await supabase.rpc("list_team", { p_organization_id: business.id });
  if (team.error) throw new Error("No se pudo cargar el equipo.");
  const members = team.data;
  const emails = new Map(members.map(m => [m.user_id, m.email]));

  const resolved = resolveReportPeriod(input);
  const kind = resolved.ok ? resolved.period.kind : resolved.kind;
  const memberId = memberParam && isUuid(memberParam) && emails.has(memberParam) ? memberParam : null;
  const memberError = memberParam && !memberId ? "Ese miembro no pertenece a esta barbería." : null;

  const filters = new URLSearchParams({ periodo: kind });
  if (kind === "personalizado") { filters.set("desde", input.desde); filters.set("hasta", input.hasta); }
  if (memberId) filters.set("trabajador", memberId);
  const href = (p: number) => `/panel/${business.id}/reportes?${new URLSearchParams([...filters, ["pagina", String(p)]])}`;

  let content: React.ReactNode;
  if (!resolved.ok || memberError) {
    content = <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{memberError ?? (!resolved.ok ? resolved.error : null)}</p>;
  } else {
    const { period } = resolved;
    const args = { p_organization_id: business.id, p_from: period.from, p_to: period.to, p_attended_by: memberId };
    const [summaryResult, detailResult] = await Promise.all([
      supabase.rpc("get_business_report", args),
      supabase.rpc("list_report_visits", { ...args, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE }),
    ]);
    const error = summaryResult.error ?? detailResult.error;
    const report = summaryResult.error ? null : parseBusinessReport(summaryResult.data);

    if (error || !report) {
      content = <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
        {error ? dbErrorMessage(error, { validation: "Revisa el período y el trabajador elegidos." }) : "No se pudo leer el reporte. Inténtalo de nuevo."}
      </p>;
    } else {
      const pages = Math.max(1, Math.ceil(report.totals.visits / PAGE_SIZE));
      if (page > pages) redirect(href(pages));
      const rows = detailResult.data ?? [];

      content = <>
        <section aria-labelledby="summary-heading" className="flex flex-col gap-3">
          <h2 id="summary-heading" className="text-lg font-semibold">
            {memberId ? `Resumen de ${emails.get(memberId)}` : "Resumen del negocio"}
          </h2>
          <Metrics amounts={report.totals} />
          <p className="text-sm text-brand-muted">
            El total de servicios registrados suma los precios guardados en cada visita, después de descuentos. No es dinero
            cobrado ni utilidad: Barber Field aún no registra pagos ni gastos. Las visitas anuladas no se cuentan y las
            corregidas aparecen con sus datos actuales.
          </p>
        </section>

        {report.totals.visits === 0 ? <EmptyState title="No hay visitas en este período"
          description="Prueba con otro período o con otro trabajador. Aquí aparecerán las visitas completadas que se registren." /> : <>
          <section aria-labelledby="members-heading" className="flex flex-col gap-3">
            <h2 id="members-heading" className="text-lg font-semibold">Por quien atendió</h2>
            <ul className="flex flex-col gap-3">
              {report.members.map(member => <li key={member.userId} className="flex flex-col gap-3 rounded-xl border border-brand-line p-4">
                <p className="font-semibold break-all">
                  {member.email ?? "Miembro sin correo"}{" "}
                  <span className="text-sm font-normal text-brand-muted">
                    · {member.role === "owner" ? "Dueño" : "Trabajador"}{member.isActive ? "" : " · desactivado"}
                  </span>
                </p>
                <Metrics amounts={member} />
              </li>)}
            </ul>
          </section>

          <section aria-labelledby="detail-heading" className="flex flex-col gap-3">
            <h2 id="detail-heading" className="text-lg font-semibold">Visitas del período</h2>
            <ul className="flex flex-col gap-3">
              {rows.map(row => {
                const items = parseReportItems(row.items);
                return <li key={row.visit_id} className="flex flex-col gap-2 rounded-xl border border-brand-line p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/panel/${business.id}/clientes/${row.customer_id}`} className="font-semibold underline">
                      {row.customer_name}
                    </Link>
                    <span className="text-sm text-brand-muted">{formatDateTime(row.visited_at)}</span>
                  </div>
                  <p className="text-sm break-all">
                    Atendió {row.attended_by_email ?? "miembro sin correo"}
                    {row.corrected_at ? <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium">Corregida</span> : null}
                  </p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {items.map((item, index) => <li key={index} className="flex justify-between gap-3">
                      <span>{item.quantity} × {item.serviceName} <span className="text-brand-muted">({formatPEN(item.unitPrice)} c/u)</span></span>
                      <span className="tabular-nums">{formatPEN(item.net)}</span>
                    </li>)}
                  </ul>
                  <dl className="grid grid-cols-3 gap-2 border-t border-brand-line pt-2 text-sm">
                    <div><dt className="text-brand-muted">Subtotal</dt><dd className="tabular-nums">{formatPEN(row.subtotal)}</dd></div>
                    <div><dt className="text-brand-muted">Descuento</dt><dd className="tabular-nums">{formatPEN(row.discount_total)}</dd></div>
                    <div><dt className="text-brand-muted">Total</dt><dd className="font-semibold tabular-nums">{formatPEN(row.total)}</dd></div>
                  </dl>
                </li>;
              })}
            </ul>
            {pages > 1 ? <nav aria-label="Páginas de visitas" className="flex justify-between gap-3">
              {page > 1 ? <Link href={href(page - 1)} className="underline">Anterior</Link> : <span />}
              <span>Página {page} de {pages}</span>
              {page < pages ? <Link href={href(page + 1)} className="underline">Siguiente</Link> : <span />}
            </nav> : null}
          </section>
        </>}
      </>;
    }
  }

  const periodLabel = resolved.ok ? resolved.period.label : "Período no válido";

  return <section className="flex flex-col gap-6">
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold">Reportes</h1>
      <p className="text-brand-muted">Visible solo para el dueño. Fechas en hora de Lima.</p>
    </div>

    <form method="get" className="flex flex-col gap-4 rounded-2xl border border-brand-line bg-white p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="periodo" className="text-sm font-medium">Período</label>
          <select id="periodo" name="periodo" defaultValue={kind} className={selectClass}>
            {PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="trabajador" className="text-sm font-medium">Atendido por</label>
          <select id="trabajador" name="trabajador" defaultValue={memberId ?? ""} className={selectClass}>
            <option value="">Todo el equipo</option>
            {members.map(m => <option key={m.user_id} value={m.user_id}>
              {m.email}{m.role === "owner" ? " (dueño)" : ""}{m.is_active ? "" : " (desactivado)"}
            </option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="desde" className="text-sm font-medium">Desde</label>
          <input id="desde" name="desde" type="date" min="2000-01-01" max="2100-12-31" defaultValue={input.desde}
            aria-describedby="dates-hint" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hasta" className="text-sm font-medium">Hasta</label>
          <input id="hasta" name="hasta" type="date" min="2000-01-01" max="2100-12-31" defaultValue={input.hasta}
            aria-describedby="dates-hint" className={inputClass} />
        </div>
      </div>
      <p id="dates-hint" className="text-sm text-brand-muted">
        Las fechas se usan con «Fechas personalizadas». Ambas se incluyen, hasta 366 días.
      </p>
      <button type="submit" className={`${buttonClass} sm:w-auto sm:self-start`}>Ver reporte</button>
    </form>

    <p role="status" className="rounded-xl bg-brand-soft p-4 font-medium">
      Período: {periodLabel}
      {memberId ? <span className="block text-sm font-normal break-all">Atendido por: {emails.get(memberId)}</span> : null}
    </p>

    {content}
  </section>;
}
