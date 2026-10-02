import { LoadingState } from "@/components/loading-state";

export default function NetworkLoading() {
  return <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl p-6"><LoadingState label="Cargando barberías…" /></main>;
}
