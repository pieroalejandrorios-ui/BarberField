import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/lib/dates";
import { requireOwner, requireUser } from "@/lib/session";
import { parsePageNumber } from "@/lib/validation/pagination";
import { AuditSnapshot } from "./audit-snapshot";

export const metadata = { title: "Auditoría · Barber Field" };
const PAGE_SIZE = 20;
const ACTIONS: Record<string, string> = {
  visit_corrected: "Visita corregida", visit_voided: "Visita anulada", loyalty_program_saved: "Premio configurado",
};

export default async function AuditPage({ params, searchParams }: PageProps<"/panel/[orgId]/auditoria">) {
  const { orgId } = await params;
  const business = await requireOwner(orgId);
  const query = await searchParams;
  const page = parsePageNumber((Array.isArray(query.pagina) ? query.pagina[0] : query.pagina) ?? "", PAGE_SIZE);
  const { supabase } = await requireUser();
  const [events, team] = await Promise.all([
    supabase.from("audit_events").select("id, actor_id, action, entity_id, reason, changes, created_at", { count: "exact" })
      .eq("organization_id", business.id).order("created_at", { ascending: false }).order("id", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.rpc("list_team", { p_organization_id: business.id }),
  ]);
  if (events.error || team.error) throw new Error("No se pudo cargar la auditoría.");
  const pages = Math.max(1, Math.ceil((events.count ?? 0) / PAGE_SIZE));
  const href = (p: number) => `/panel/${business.id}/auditoria?pagina=${p}`;
  if (page > pages) redirect(href(pages));
  const members = new Map(team.data.map(m => [m.user_id, m.email]));
  return <section className="flex flex-col gap-4">
    <h1 className="text-2xl font-semibold">Auditoría</h1>
    <p>Registro de cambios, visible solo para el dueño.</p>
    {!events.data.length ? <p>No hay cambios registrados.</p> : <ul className="flex flex-col gap-4">
      {events.data.map(e => <li key={e.id} className="rounded-xl border border-brand-line p-4">
        <p className="font-semibold">{ACTIONS[e.action] ?? e.action} · {formatDateTime(e.created_at)}</p>
        <p>Por {members.get(e.actor_id) ?? "miembro anterior"}</p>
        {e.reason ? <p>Motivo: {e.reason}</p> : null}
        {e.entity_id && (e.action === "visit_corrected" || e.action === "visit_voided") ? <Link className="underline" href={`/panel/${business.id}/visitas/${e.entity_id}/corregir`}>Ver visita</Link> : null}
        <AuditSnapshot changes={e.changes} members={members} />
      </li>)}
    </ul>}
    {pages > 1 ? <nav aria-label="Páginas de auditoría" className="flex justify-between gap-3">
      {page > 1 ? <Link href={href(page - 1)} className="underline">Anterior</Link> : <span />}
      <span>Página {page} de {pages}</span>
      {page < pages ? <Link href={href(page + 1)} className="underline">Siguiente</Link> : <span />}
    </nav> : null}
  </section>;
}
