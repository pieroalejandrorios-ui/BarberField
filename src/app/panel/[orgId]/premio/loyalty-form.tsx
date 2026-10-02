"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, TextAreaField, buttonClass } from "@/components/ui";
import {
  REWARD_TEXT_MAX_LENGTH,
  REWARD_TYPES,
  VISITS_REQUIRED_MAX,
  VISITS_REQUIRED_MIN,
  type LoyaltyFormValues,
} from "@/lib/validation/loyalty";
import { saveLoyaltyProgram, type LoyaltyFormState } from "./actions";

const initialState: LoyaltyFormState = { status: "idle" };

export function LoyaltyForm({
  organizationId,
  services,
  initialValues,
  isNew,
}: {
  organizationId: string;
  services: Array<{ id: string; name: string }>;
  initialValues: LoyaltyFormValues;
  isNew: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveLoyaltyProgram.bind(null, organizationId), initialState);
  // Si hubo error se conserva lo escrito; si no, los valores guardados.
  const values = state.status === "error" && state.values ? state.values : initialValues;
  const [rewardType, setRewardType] = useState(values.rewardType);
  const errors = state.errors;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <Field
        id="visitsRequired"
        label="Visitas para ganar el premio"
        inputMode="numeric"
        required
        defaultValue={values.visitsRequired}
        hint={`Entre ${VISITS_REQUIRED_MIN} y ${VISITS_REQUIRED_MAX}. Toda visita completada suma 1, sin importar cuántos servicios tenga.`}
        error={errors?.visitsRequired}
      />

      <fieldset className="flex flex-col gap-2" aria-describedby={errors?.rewardType ? "rewardType-error" : undefined}>
        <legend className="mb-1 text-sm font-medium">Premio</legend>
        {REWARD_TYPES.map((option) => (
          <label key={option.type} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              name="rewardType"
              value={option.type}
              checked={rewardType === option.type}
              onChange={() => setRewardType(option.type)}
              className="size-5 accent-brand-ink"
            />
            <span>{option.label}</span>
          </label>
        ))}
        {errors?.rewardType ? (
          <p id="rewardType-error" className="text-sm text-red-700 ">
            {errors.rewardType}
          </p>
        ) : null}
      </fieldset>

      {rewardType === "free_service" ? (
        services.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Primero agrega el servicio en «Servicios».
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="serviceId" className="text-sm font-medium">
              Servicio gratis
            </label>
            <select
              id="serviceId"
              name="serviceId"
              defaultValue={values.serviceId}
              aria-invalid={errors?.serviceId ? true : undefined}
              aria-describedby={`serviceId-hint${errors?.serviceId ? " serviceId-error" : ""}`}
              className="min-h-11 rounded-xl border border-brand-line bg-white px-3 py-2 text-base text-brand-ink"
            >
              <option value="">Elige un servicio</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
            <p id="serviceId-hint" className="text-sm text-brand-muted">
              Para aplicarlo, la visita debe incluir ese servicio; se descuenta una unidad.
            </p>
            {errors?.serviceId ? (
              <p id="serviceId-error" className="text-sm text-red-700 ">
                {errors.serviceId}
              </p>
            ) : null}
          </div>
        )
      ) : null}

      {rewardType === "percent_discount" ? (
        <Field
          id="percent"
          label="Porcentaje de descuento (%)"
          inputMode="decimal"
          required
          placeholder="20"
          defaultValue={values.percent}
          hint="Sobre el subtotal de la visita, redondeado a céntimos."
          error={errors?.percent}
        />
      ) : null}

      {rewardType === "fixed_discount" ? (
        <Field
          id="amount"
          label="Monto de descuento (S/)"
          inputMode="decimal"
          required
          placeholder="10.00"
          defaultValue={values.amount}
          hint="Como máximo el subtotal de la visita; el sobrante se pierde."
          error={errors?.amount}
        />
      ) : null}

      {rewardType === "custom_benefit" ? (
        <TextAreaField
          id="description"
          label="Beneficio"
          rows={2}
          required
          maxLength={REWARD_TEXT_MAX_LENGTH}
          placeholder="Lavado + mascarilla gratis"
          defaultValue={values.description}
          hint="Se entrega fuera del sistema; al aplicarlo solo queda constancia."
          error={errors?.description}
        />
      ) : null}

      <Field
        id="publicText"
        label="Texto para tu página pública (opcional)"
        maxLength={REWARD_TEXT_MAX_LENGTH}
        placeholder="Cada 5 visitas, tu corte es gratis"
        defaultValue={values.publicText}
        error={errors?.publicText}
      />

      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" name="isActive" defaultChecked={values.isActive} className="mt-1 size-5 shrink-0 accent-brand-ink" />
        <span>
          Promoción activa
          <span className="block text-sm text-brand-muted">
            Si la pausas, las visitas no suman, pero los premios pendientes se pueden aplicar.
          </span>
        </span>
      </label>

      {!isNew ? (
        <p className="rounded-xl bg-brand-soft p-3 text-sm">
          Los cambios aplican a ciclos nuevos; los clientes con progreso conservan sus reglas actuales.
        </p>
      ) : null}

      {state.status === "success" ? (
        <p role="status" aria-live="polite" className="text-sm text-green-700 ">
          {state.message}
        </p>
      ) : (
        <FormMessage message={state.message} />
      )}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Guardando…" : "Guardar premio"}
      </button>
    </form>
  );
}
