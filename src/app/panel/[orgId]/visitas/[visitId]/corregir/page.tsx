import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/dates";
import { requireMembership, requireUser } from "@/lib/session";
import { isUuid } from "@/lib/validation/uuid";
import type { PreviewReward } from "@/lib/visit-preview";
import { ChangeForm } from "./change-form";

export const metadata = { title: "Corregir visita · Barber Field" };

export default async function CorrectVisitPage({ params }: PageProps<"/panel/[orgId]/visitas/[visitId]/corregir">) {
  const { orgId, visitId } = await params;
  const business = await requireMembership(orgId);
  if (!isUuid(visitId)) notFound();
  const { supabase } = await requireUser();
  const { data: visit, error } = await supabase.from("visits").select("id, barbershop_id, customer_id, customer_seq, visited_at, attended_by, status")
    .eq("organization_id", business.id).eq("id", visitId).maybeSingle();
  if (error) throw new Error("No se pudo cargar la visita.");
  if (!visit) notFound();
  const back = `/panel/${business.id}/clientes/${visit.customer_id}`;
  if (visit.status === "voided") return <div className="flex flex-col gap-4"><Link href={back}>← Cliente</Link><p>Esta visita está anulada y no se puede modificar.</p></div>;

  const [items, services, locations, team, rewards, latest] = await Promise.all([
    supabase.from("visit_items").select("service_id, service_name, unit_price, quantity, position").eq("visit_id", visit.id).order("position"),
    supabase.from("services").select("id, name, price").eq("organization_id", business.id).is("archived_at", null).order("sort_order").order("id"),
    supabase.from("service_locations").select("service_id").eq("organization_id", business.id).eq("barbershop_id", visit.barbershop_id).eq("is_available", true),
    supabase.rpc("list_team", { p_organization_id: business.id }),
    supabase.from("rewards").select("reward_type, reward_service_id, reward_percent, reward_amount").eq("redeemed_visit_id", visit.id).maybeSingle(),
    supabase.from("visits").select("id").eq("customer_id", visit.customer_id).eq("status", "completed").order("customer_seq", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (items.error || services.error || locations.error || team.error || rewards.error || latest.error) throw new Error("No se pudo preparar la corrección.");
  const available = new Set(locations.data.map(l => l.service_id));
  const serviceMap = new Map(services.data.filter(s => available.has(s.id)).map(s => [s.id, s]));
  const retained = items.data.filter(i => serviceMap.has(i.service_id));
  const oldIds = new Set(retained.map(i => i.service_id));
  const choices = [
    ...retained.map(i => ({ id: i.service_id, name: i.service_name, price: i.unit_price.toFixed(2), quantity: i.quantity, historical: true })),
    ...[...serviceMap.values()].filter(s => !oldIds.has(s.id)).map(s => ({ id: s.id, name: s.name, price: s.price.toFixed(2), quantity: 0, historical: false })),
  ];
  const r = rewards.data;
  const reward: PreviewReward | null = !r ? null : r.reward_type === "free_service"
    ? { type: r.reward_type, serviceId: r.reward_service_id }
    : r.reward_type === "percent_discount" ? { type: r.reward_type, percent: r.reward_percent?.toFixed(2) ?? null }
    : r.reward_type === "fixed_discount" ? { type: r.reward_type, amount: r.reward_amount?.toFixed(2) ?? null }
    : { type: "custom_benefit" };
  return <section className="flex flex-col gap-5">
    <Link href={back} className="underline">← Volver al cliente</Link>
    <h1 className="text-2xl font-semibold">Visita {visit.customer_seq} · {formatDateTime(visit.visited_at)}</h1>
    {items.data.length !== retained.length ? <p role="alert">Hay servicios archivados o no disponibles. Para corregir debes reemplazarlos. Un servicio gratis aplicado debe conservarse; si está archivado, el dueño debe restaurarlo primero.</p> : null}
    <ChangeForm key={visit.id} orgId={business.id} visitId={visit.id} services={choices}
      team={team.data.filter(m => m.is_active)} attendedBy={visit.attended_by} reward={reward} canVoid={latest.data?.id === visit.id} />
  </section>;
}
