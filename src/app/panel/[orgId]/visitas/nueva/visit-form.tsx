"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, buttonClass } from "@/components/ui";
import { newIdempotencyKey } from "@/lib/idempotency";
import { describeReward, type PendingReward, type RewardTerms } from "@/lib/loyalty";
import { formatPEN } from "@/lib/money";
import { QUANTITY_FIELD_PREFIX, VISIT_MAX_QUANTITY } from "@/lib/validation/visit";
import { centsToAmount, previewVisit, type PreviewReward } from "@/lib/visit-preview";
import { registerVisit, type RegisterVisitState } from "../actions";

type Service = { id: string; name: string; price: string };
type Member = { userId: string; email: string };

const stepperButtonClass =
  "inline-flex size-11 items-center justify-center rounded-xl border border-brand-line text-xl font-medium hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ink disabled:opacity-40";

function toPreviewReward(terms: RewardTerms): PreviewReward {
  switch (terms.type) {
    case "free_service":
      return { type: "free_service", serviceId: terms.serviceId };
    case "percent_discount":
      return { type: "percent_discount", percent: terms.percent };
    case "fixed_discount":
      return { type: "fixed_discount", amount: terms.amount };
    case "custom_benefit":
      return { type: "custom_benefit" };
  }
}

function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(VISIT_MAX_QUANTITY, Math.max(0, Math.trunc(value)));
}

export function VisitForm({
  organizationId,
  customerId,
  services,
  members,
  currentUserId,
  nextVisitCompletes,
  visitsRequired,
  earnedReward,
  pendingRewards,
}: {
  organizationId: string;
  customerId: string;
  services: Service[];
  members: Member[];
  currentUserId: string;
  nextVisitCompletes: boolean;
  visitsRequired: number | null;
  earnedReward: RewardTerms | null;
  pendingRewards: PendingReward[];
}) {
  const router = useRouter();
  // Una clave por intento lógico: se crea al primer envío y se reutiliza en los
  // reintentos, para que un doble envío no registre dos visitas.
  const idempotencyKey = useRef<string | null>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: RegisterVisitState, formData: FormData) => {
      idempotencyKey.current ??= newIdempotencyKey();
      formData.set("idempotencyKey", idempotencyKey.current);
      return registerVisit(organizationId, customerId, prev, formData);
    },
    {},
  );

  // Otro registro cambió el progreso: se vuelve a consultar desde el servidor.
  useEffect(() => {
    if (state.stale) router.refresh();
  }, [state, router]);

  // Estado controlado: React restablece los campos no controlados tras cada
  // envío, y si algo falla se debe conservar lo elegido.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [attendedBy, setAttendedBy] = useState(currentUserId);
  const [choice, setChoice] = useState(nextVisitCompletes ? "apply_now" : "none");

  // Si el progreso cambió tras recargar, la elección anterior puede no valer.
  const validChoices = nextVisitCompletes
    ? ["apply_now", "later"]
    : ["none", ...pendingRewards.map((reward) => `pending:${reward.id}`)];
  const effectiveChoice = validChoices.includes(choice) ? choice : validChoices[0];

  const appliedTerms =
    effectiveChoice === "apply_now"
      ? earnedReward
      : (pendingRewards.find((reward) => `pending:${reward.id}` === effectiveChoice) ?? null);

  const preview = previewVisit(
    services.map((service) => ({ serviceId: service.id, price: service.price, quantity: quantities[service.id] ?? 0 })),
    appliedTerms ? toPreviewReward(appliedTerms) : null,
  );
  const hasItems = services.some((service) => (quantities[service.id] ?? 0) > 0);
  const setQuantity = (serviceId: string, value: number) =>
    setQuantities((current) => ({ ...current, [serviceId]: clampQuantity(value) }));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="rewardDecisionRequired" value={nextVisitCompletes ? "1" : "0"} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-semibold">Servicios</legend>
        <ul className="flex flex-col divide-y divide-brand-line rounded-xl border border-brand-line">
          {services.map((service) => {
            const quantity = quantities[service.id] ?? 0;
            const labelId = `service-${service.id}`;
            return (
              <li key={service.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p id={labelId} className="font-medium">
                    {service.name}
                  </p>
                  <p className="text-sm text-brand-muted tabular-nums">{formatPEN(service.price)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={stepperButtonClass}
                    aria-label={`Quitar una unidad de ${service.name}`}
                    disabled={quantity === 0}
                    onClick={() => setQuantity(service.id, quantity - 1)}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={VISIT_MAX_QUANTITY}
                    name={`${QUANTITY_FIELD_PREFIX}${service.id}`}
                    value={quantity}
                    onChange={(event) => setQuantity(service.id, Number(event.target.value))}
                    aria-labelledby={labelId}
                    className="min-h-11 w-14 rounded-xl border border-brand-line bg-white px-2 text-center text-base text-brand-ink"
                  />
                  <button
                    type="button"
                    className={stepperButtonClass}
                    aria-label={`Agregar una unidad de ${service.name}`}
                    disabled={quantity >= VISIT_MAX_QUANTITY}
                    onClick={() => setQuantity(service.id, quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="attendedBy" className="text-sm font-medium">
          Atendido por
        </label>
        <select
          id="attendedBy"
          name="attendedBy"
          value={attendedBy}
          onChange={(event) => setAttendedBy(event.target.value)}
          className="min-h-11 rounded-xl border border-brand-line bg-white px-3 py-2 text-base text-brand-ink"
        >
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.userId === currentUserId ? `${member.email} (yo)` : member.email}
            </option>
          ))}
        </select>
      </div>

      {nextVisitCompletes && earnedReward ? (
        <fieldset className="flex flex-col gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950">
          <legend className="sr-only">Premio de esta visita</legend>
          <p className="font-semibold" role="status">
            Esta es la visita {visitsRequired}: corresponde el premio «{describeReward(earnedReward)}».
          </p>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="reward"
              value="apply_now"
              checked={effectiveChoice === "apply_now"}
              onChange={() => setChoice("apply_now")}
              className="size-5 accent-brand-ink"
            />
            Premio aplicado en esta visita
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="reward"
              value="later"
              checked={effectiveChoice === "later"}
              onChange={() => setChoice("later")}
              className="size-5 accent-brand-ink"
            />
            El cliente lo usará después
          </label>
        </fieldset>
      ) : pendingRewards.length > 0 ? (
        <fieldset className="flex flex-col gap-2 rounded-xl border border-brand-line p-4">
          <legend className="px-1 font-semibold">Premios pendientes</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="reward"
              value="none"
              checked={effectiveChoice === "none"}
              onChange={() => setChoice("none")}
              className="size-5 accent-brand-ink"
            />
            No aplicar en esta visita
          </label>
          {pendingRewards.map((reward) => {
            const value = `pending:${reward.id}`;
            return (
              <label key={reward.id} className="flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="reward"
                  value={value}
                  checked={effectiveChoice === value}
                  onChange={() => setChoice(value)}
                  className="size-5 accent-brand-ink"
                />
                Aplicar: {describeReward(reward)}
              </label>
            );
          })}
        </fieldset>
      ) : (
        <input type="hidden" name="reward" value="none" />
      )}

      {appliedTerms && preview.missingRewardService && hasItems ? (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Para aplicar el premio, agrega «{appliedTerms.serviceName}» a la visita
          {effectiveChoice === "apply_now" ? " o elige «El cliente lo usará después»" : ""}.
        </p>
      ) : null}
      {preview.lostCents > 0 && hasItems ? (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          El descuento es mayor que el subtotal: se pierden {formatPEN(centsToAmount(preview.lostCents))}.
        </p>
      ) : null}

      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 rounded-xl bg-brand-soft p-4 tabular-nums" aria-live="polite">
        <dt>Subtotal</dt>
        <dd className="text-right">{formatPEN(centsToAmount(preview.subtotalCents))}</dd>
        {appliedTerms ? (
          <>
            <dt>Premio</dt>
            <dd className="text-right">
              {preview.discountCents > 0 ? `− ${formatPEN(centsToAmount(preview.discountCents))}` : "Sin descuento"}
            </dd>
          </>
        ) : null}
        <dt className="text-lg font-semibold">Total</dt>
        <dd className="text-right text-lg font-semibold">{formatPEN(centsToAmount(preview.totalCents))}</dd>
      </dl>

      <FormMessage message={state.message} />
      <button
        type="submit"
        className={buttonClass}
        disabled={pending || !hasItems || (appliedTerms !== null && preview.missingRewardService)}
      >
        {pending ? "Registrando…" : "Registrar visita"}
      </button>
    </form>
  );
}
