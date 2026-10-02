export function LoadingState({ label = "Cargando la página…" }: { label?: string }) {
  return <div role="status" aria-live="polite" className="flex flex-col gap-4">
    <p className="text-sm text-brand-muted">{label}</p>
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-4 motion-reduce:animate-none">
      <div className="h-8 w-2/3 rounded-xl bg-brand-line" />
      <div className="h-28 rounded-xl bg-brand-soft" />
      <div className="h-16 rounded-xl bg-brand-soft" />
    </div>
  </div>;
}
