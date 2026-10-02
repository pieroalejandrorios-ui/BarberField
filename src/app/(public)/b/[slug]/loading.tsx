import { LoadingState } from "@/components/loading-state";

export default function PublicPageLoading() {
  return <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-2xl p-6"><LoadingState label="Cargando la barbería…" /></main>;
}
