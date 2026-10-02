import type { Metadata } from "next";
import { formatDate } from "@/lib/dates";
import { EmptyState } from "@/components/empty-state";
import { requireOwner, requireUser } from "@/lib/session";
import { AddWorkerForm, WorkerToggle } from "./team-forms";

export const metadata: Metadata = { title: "Equipo · Barber Field" };

export default async function TeamPage({ params }: PageProps<"/panel/[orgId]/equipo">) {
  const { orgId } = await params;
  const business = await requireOwner(orgId);
  const { supabase } = await requireUser();

  const { data: team, error } = await supabase.rpc("list_team", { p_organization_id: business.id });
  if (error) throw new Error("No se pudo cargar el equipo.");

  const workers = team.filter((member) => member.role === "barber");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Equipo</h1>
        <p className="text-sm text-brand-muted">
          Una persona puede trabajar para hasta 3 dueños distintos. Al desactivarla pierde el acceso a esta
          barbería, pero sus registros se conservan.
        </p>
        <AddWorkerForm organizationId={business.id} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="workers-heading">
        <h2 id="workers-heading" className="text-lg font-semibold">
          Trabajadores
        </h2>
        {workers.length === 0 ? (
          <EmptyState title="Tu equipo todavía no tiene trabajadores" description="Pídeles que creen su cuenta y agrégalos con el correo que usaron para registrarse. Puedes seguir registrando visitas como dueño." />
        ) : (
          <ul className="flex flex-col divide-y divide-brand-line rounded-xl border border-brand-line">
            {workers.map((worker) => (
              <li
                key={worker.user_id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{worker.email}</p>
                  <p className="text-sm text-brand-muted">
                    {worker.is_active ? "Activo" : "Desactivado"} · desde {formatDate(worker.created_at)}
                  </p>
                </div>
                <WorkerToggle
                  organizationId={business.id}
                  userId={worker.user_id}
                  isActive={worker.is_active}
                  email={worker.email}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
