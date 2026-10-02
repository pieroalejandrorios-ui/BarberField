import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export const buttonClass =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-line bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink disabled:cursor-not-allowed disabled:opacity-60";

const inputClass =
  "rounded-xl border border-brand-line bg-white px-3 py-2 text-base text-brand-ink focus:border-brand-ink focus:outline-2 focus:outline-brand-ink aria-invalid:border-red-600";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
};

// Campo con etiqueta, ayuda y error asociados para lectores de pantalla.
export function Field({ id, label, error, hint, ...inputProps }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`min-h-11 ${inputClass}`}
        {...inputProps}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-brand-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700 ">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
};

export function TextAreaField({ id, label, error, hint, ...textareaProps }: TextAreaFieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={inputClass}
        {...textareaProps}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-brand-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700 ">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormMessage({ message }: { message?: string }) {
  return (
    <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-700">
      {message}
    </p>
  );
}

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  id: string;
  label: ReactNode;
  error?: string;
};

// Casilla con el mismo aspecto que el consentimiento de clientes.
export function CheckboxField({ id, label, error, ...inputProps }: CheckboxFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 items-start gap-3">
        <input
          id={id}
          name={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-1 size-5 shrink-0 accent-brand-ink"
          {...inputProps}
        />
        <label htmlFor={id}>{label}</label>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700 ">
          {error}
        </p>
      ) : null}
    </div>
  );
}
