"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { FormMessage, TextAreaField, buttonClass } from "@/components/ui";
import { MAX_RANGES_PER_DAY, WEEKDAYS, type DayHours } from "@/lib/validation/hours";
import { HOURS_NOTE_MAX_LENGTH } from "@/lib/validation/page";
import { saveHours, type HoursFormState } from "./actions";

const initialState: HoursFormState = { status: "idle" };
const DEFAULT_RANGE = { opensAt: "09:00", closesAt: "20:00" };

const timeInputClass =
  "min-h-11 rounded-xl border border-brand-line bg-white px-2 text-base text-brand-ink";

export function HoursForm({
  organizationId,
  initialDays,
  initialNote,
}: {
  organizationId: string;
  initialDays: DayHours[];
  initialNote: string;
}) {
  const [state, formAction, pending] = useActionState(saveHours.bind(null, organizationId), initialState);
  const [days, setDays] = useState(initialDays);
  const [note, setNote] = useState(initialNote);

  function updateDay(weekday: number, change: (day: DayHours) => DayHours) {
    setDays((current) => current.map((day) => (day.weekday === weekday ? change(day) : day)));
  }

  // Envío manual para que React no reinicie el estado si hay error.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => formAction({ days, note }));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <ul className="flex flex-col divide-y divide-brand-line rounded-xl border border-brand-line">
        {WEEKDAYS.map(({ weekday, label }) => {
          const day = days.find((d) => d.weekday === weekday) ?? { weekday, isOpen: false, ranges: [] };
          const error = state.dayErrors?.[weekday];
          return (
            <li key={weekday} className="flex flex-col gap-2 px-4 py-3">
              <fieldset className="flex flex-col gap-2" aria-describedby={error ? `hours-${weekday}-error` : undefined}>
                <legend className="sr-only">{label}</legend>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5 accent-brand-ink"
                    checked={day.isOpen}
                    onChange={(event) => {
                      const isOpen = event.target.checked;
                      updateDay(weekday, (d) => ({
                        ...d,
                        isOpen,
                        ranges: isOpen && d.ranges.length === 0 ? [DEFAULT_RANGE] : d.ranges,
                      }));
                    }}
                  />
                  <span className="font-medium">{label}</span>
                  {day.isOpen ? null : <span className="text-sm text-brand-muted">Cerrado</span>}
                </label>

                {day.isOpen
                  ? day.ranges.map((range, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`hours-${weekday}-${index}-open`}>
                          {`${label}, horario ${index + 1}: apertura`}
                        </label>
                        <input
                          id={`hours-${weekday}-${index}-open`}
                          type="time"
                          className={timeInputClass}
                          value={range.opensAt}
                          onChange={(event) =>
                            updateDay(weekday, (d) => ({
                              ...d,
                              ranges: d.ranges.map((r, i) => (i === index ? { ...r, opensAt: event.target.value } : r)),
                            }))
                          }
                        />
                        <span aria-hidden="true">a</span>
                        <label className="sr-only" htmlFor={`hours-${weekday}-${index}-close`}>
                          {`${label}, horario ${index + 1}: cierre`}
                        </label>
                        <input
                          id={`hours-${weekday}-${index}-close`}
                          type="time"
                          className={timeInputClass}
                          value={range.closesAt}
                          onChange={(event) =>
                            updateDay(weekday, (d) => ({
                              ...d,
                              ranges: d.ranges.map((r, i) => (i === index ? { ...r, closesAt: event.target.value } : r)),
                            }))
                          }
                        />
                        {index > 0 ? (
                          <button
                            type="button"
                            className="min-h-11 px-2 text-sm underline"
                            onClick={() => updateDay(weekday, (d) => ({ ...d, ranges: d.ranges.filter((_, i) => i !== index) }))}
                          >
                            Quitar
                          </button>
                        ) : null}
                      </div>
                    ))
                  : null}

                {day.isOpen && day.ranges.length < MAX_RANGES_PER_DAY ? (
                  <button
                    type="button"
                    className="min-h-11 self-start text-sm underline"
                    onClick={() =>
                      updateDay(weekday, (d) => ({ ...d, ranges: [...d.ranges, { opensAt: "15:00", closesAt: "21:00" }] }))
                    }
                  >
                    Agregar otro horario (p. ej. por la tarde)
                  </button>
                ) : null}

                {error ? (
                  <p id={`hours-${weekday}-error`} className="text-sm text-red-700 ">
                    {error}
                  </p>
                ) : null}
              </fieldset>
            </li>
          );
        })}
      </ul>

      <TextAreaField
        id="hoursNote"
        label="Nota (opcional)"
        rows={2}
        maxLength={HOURS_NOTE_MAX_LENGTH}
        placeholder="Feriados consultar"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        error={state.noteError}
      />

      {state.status === "success" ? (
        <p role="status" aria-live="polite" className="text-sm text-green-700 ">
          {state.message}
        </p>
      ) : (
        <FormMessage message={state.message} />
      )}
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Guardando…" : "Guardar horario"}
      </button>
    </form>
  );
}
