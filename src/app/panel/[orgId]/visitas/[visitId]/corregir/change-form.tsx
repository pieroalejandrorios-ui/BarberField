"use client";

import { useActionState, useState } from "react";
import { buttonClass, Field, FormMessage, TextAreaField } from "@/components/ui";
import { formatPEN } from "@/lib/money";
import { previewVisit, type PreviewReward } from "@/lib/visit-preview";
import { changeVisit, type VisitChangeState } from "../../correction-actions";

type Service = { id: string; name: string; price: string; quantity: number; historical: boolean };

export function ChangeForm({ orgId, visitId, services, team, attendedBy, reward, canVoid }: {
  orgId: string; visitId: string; services: Service[];
  team: Array<{ user_id: string; email: string }>; attendedBy: string;
  reward: PreviewReward | null; canVoid: boolean;
}) {
  const [state, action, pending] = useActionState<VisitChangeState, FormData>(changeVisit.bind(null, orgId, visitId, "correct"), {});
  const [quantities, setQuantities] = useState<Record<string, number>>(Object.fromEntries(services.map(s => [s.id, s.quantity])));
  const [attendant, setAttendant] = useState(team.some(m => m.user_id === attendedBy) ? attendedBy : "");
  const [reason, setReason] = useState("");
  const preview = previewVisit(services.map(s => ({ serviceId: s.id, price: s.price, quantity: quantities[s.id] ?? 0 })), reward);
  return <div className="flex flex-col gap-8">
    <form action={action} className="flex flex-col gap-4">
      <fieldset disabled={pending} className="flex flex-col gap-4">
        <legend className="mb-3 font-semibold">Corregir servicios y atención</legend>
        <p className="text-sm">Las líneas conservadas mantienen su precio histórico. Usa cantidad 0 para quitar una línea. El cliente y los puntos no cambian.</p>
        {services.map(s => <Field key={s.id} id={`quantity:${s.id}`} label={`${s.name} · ${formatPEN(s.price)}${s.historical ? " (precio histórico)" : ""}`}
          type="number" min={0} max={99} step={1} value={quantities[s.id] ?? 0}
          onChange={event => setQuantities({ ...quantities, [s.id]: Number(event.target.value) })} />)}
        <label htmlFor="attendedBy">Atendido por</label>
        <select id="attendedBy" name="attendedBy" required value={attendant} onChange={event => setAttendant(event.target.value)} className="min-h-11 rounded-xl border bg-white p-2 text-brand-ink">
          <option value="" disabled>Elige un miembro activo</option>
          {team.map(m => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
        </select>
        <p aria-live="polite">Total estimado: <strong>{formatPEN(preview.totalCents / 100)}</strong> · descuento {formatPEN(preview.discountCents / 100)}. El servidor confirma el importe.</p>
        {preview.missingRewardService ? <p role="alert">Debes conservar el servicio del premio gratis aplicado.</p> : null}
        <TextAreaField id="reason" label="Motivo de la corrección" required maxLength={300} value={reason} onChange={event => setReason(event.target.value)} hint="No incluyas DNI, celulares ni contraseñas." />
        <FormMessage message={state.message} />
        <button className={buttonClass} disabled={pending || preview.missingRewardService}>{pending ? "Guardando…" : "Guardar corrección"}</button>
      </fieldset>
    </form>
    {canVoid ? <VoidForm orgId={orgId} visitId={visitId} /> : <p>Solo se puede anular la última visita completada del cliente.</p>}
  </div>;
}

function VoidForm({ orgId, visitId }: { orgId: string; visitId: string }) {
  const [state, action, pending] = useActionState<VisitChangeState, FormData>(changeVisit.bind(null, orgId, visitId, "void"), {});
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return <form action={action} className="rounded-xl border border-red-300 p-4">
    <fieldset disabled={pending} className="flex flex-col gap-4">
      <legend className="font-semibold">Anular esta visita</legend>
      <p>Se conservará en el historial. Se revertirá su punto, el premio emitido se anulará y un premio pendiente aplicado volverá a estar disponible.</p>
      <TextAreaField id="void-reason" name="reason" label="Motivo de la anulación" required maxLength={300} value={reason} onChange={event => setReason(event.target.value)} hint="No incluyas datos personales." />
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="confirmed" value="yes" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirmo que quiero anular esta visita y revertir sus efectos.</label>
      <FormMessage message={state.message} />
      <button className={buttonClass} disabled={pending}>{pending ? "Anulando…" : "Anular visita"}</button>
    </fieldset>
  </form>;
}
