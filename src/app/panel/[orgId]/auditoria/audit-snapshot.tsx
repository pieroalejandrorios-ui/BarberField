import { formatPEN } from "@/lib/money";
import type { Json } from "@/lib/supabase/database.types";

function record(value: Json | undefined): { [key: string]: Json | undefined } | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function money(value: Json | undefined): string {
  return typeof value === "number" || typeof value === "string" ? formatPEN(value) : "—";
}
const STATES: Record<string, string> = {
  completed: "completada", voided: "anulado", open: "abierto", available: "pendiente", redeemed: "aplicado", active: "activo", paused: "pausado",
};

function Snapshot({ value, members }: { value: Json | undefined; members: Map<string, string> }) {
  const state = record(value);
  if (!state) return <p>Sin registro anterior.</p>;
  const visit = record(state.visit);
  if (!visit) return <dl className="text-sm">
    <dt>Visitas necesarias</dt><dd>{typeof state.visits_required === "number" ? state.visits_required : "—"}</dd>
    <dt>Estado</dt><dd>{typeof state.status === "string" ? STATES[state.status] ?? state.status : "—"}</dd>
  </dl>;
  const items = Array.isArray(state.items) ? state.items : [];
  const rewards = Array.isArray(state.rewards) ? state.rewards : [];
  const cycles = Array.isArray(state.cycles) ? state.cycles : [];
  return <div className="flex flex-col gap-2 text-sm">
    <p>Estado: {typeof visit.status === "string" ? STATES[visit.status] ?? visit.status : "—"}</p>
    <p>Atendido por: {typeof visit.attended_by === "string" ? members.get(visit.attended_by) ?? "miembro anterior" : "—"}</p>
    <ul className="list-inside list-disc">{items.map((item, index) => {
      const i = record(item);
      return i ? <li key={index}>{typeof i.quantity === "number" ? i.quantity : "—"} × {typeof i.service_name === "string" ? i.service_name : "Servicio"} · precio unitario {money(i.unit_price)} · neto {money(i.net)}</li> : null;
    })}</ul>
    <p>Subtotal: {money(visit.subtotal)} · descuento: {money(visit.discount_total)} · total: {money(visit.total)}</p>
    {rewards.map((reward, index) => {
      const r = record(reward);
      return r ? <p key={index}>Premio {index + 1}: {typeof r.status === "string" ? STATES[r.status] ?? r.status : "—"} · descuento aplicado {money(r.discount_applied)}</p> : null;
    })}
    {cycles.map((cycle, index) => {
      const c = record(cycle);
      return c ? <p key={index}>Ciclo {index + 1}: {typeof c.progress === "number" ? c.progress : "—"} de {typeof c.visits_required === "number" ? c.visits_required : "—"} · {typeof c.status === "string" ? STATES[c.status] ?? c.status : "—"}</p> : null;
    })}
  </div>;
}

export function AuditSnapshot({ changes, members }: { changes: Json; members: Map<string, string> }) {
  const state = record(changes);
  return <details className="mt-2">
    <summary className="cursor-pointer">Comparar antes y después</summary>
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <section><h2 className="mb-2 font-semibold">Antes</h2><Snapshot value={state?.before} members={members} /></section>
      <section><h2 className="mb-2 font-semibold">Después</h2><Snapshot value={state?.after} members={members} /></section>
    </div>
  </details>;
}
