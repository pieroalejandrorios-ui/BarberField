import type { Metadata } from "next";
import { describeReward } from "@/lib/loyalty";
import { requireMembership, requireUser } from "@/lib/session";
import { VISITS_REQUIRED_DEFAULT, type LoyaltyFormValues } from "@/lib/validation/loyalty";
import { LoyaltyForm } from "./loyalty-form";

export const metadata: Metadata = { title: "Premio · Barber Field" };

export default async function LoyaltyPage({ params }: PageProps<"/panel/[orgId]/premio">) {
  const { orgId } = await params;
  const business = await requireMembership(orgId);
  const isOwner = business.role === "owner";
  const { supabase } = await requireUser();

  const [programResult, servicesResult] = await Promise.all([
    supabase
      .from("loyalty_programs")
      .select("visits_required, reward_type, reward_service_id, reward_percent, reward_amount, reward_description, public_text, status")
      .eq("organization_id", business.id)
      .maybeSingle(),
    supabase
      .from("services")
      .select("id, name")
      .eq("organization_id", business.id)
      .is("archived_at", null)
      .order("sort_order")
      .order("created_at"),
  ]);
  if (programResult.error || servicesResult.error) throw new Error("No se pudo cargar el premio.");
  const program = programResult.data;
  const services = servicesResult.data;

  if (!isOwner) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Premio por fidelidad</h1>
        {program ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-brand-muted">Meta</dt>
            <dd>{program.visits_required} visitas</dd>
            <dt className="text-brand-muted">Premio</dt>
            <dd>
              {describeReward({
                type: program.reward_type,
                serviceName: services.find((s) => s.id === program.reward_service_id)?.name ?? null,
                percent: program.reward_percent === null ? null : program.reward_percent.toFixed(2),
                amount: program.reward_amount === null ? null : program.reward_amount.toFixed(2),
                description: program.reward_description,
              })}
            </dd>
            <dt className="text-brand-muted">Estado</dt>
            <dd>{program.status === "active" ? "Activa" : "Pausada: las visitas no suman"}</dd>
          </dl>
        ) : (
          <p className="text-brand-muted">El dueño aún no configuró el premio.</p>
        )}
        <p className="text-sm text-brand-muted">Solo el dueño puede cambiar el premio.</p>
      </section>
    );
  }

  const initialValues: LoyaltyFormValues = program
    ? {
        visitsRequired: String(program.visits_required),
        rewardType: program.reward_type,
        serviceId: program.reward_service_id ?? "",
        percent: program.reward_percent === null ? "" : program.reward_percent.toFixed(2),
        amount: program.reward_amount === null ? "" : program.reward_amount.toFixed(2),
        description: program.reward_description ?? "",
        publicText: program.public_text ?? "",
        isActive: program.status === "active",
      }
    : {
        visitsRequired: String(VISITS_REQUIRED_DEFAULT),
        rewardType: "free_service",
        serviceId: "",
        percent: "",
        amount: "",
        description: "",
        publicText: "",
        isActive: true,
      };

  // El servicio del premio pudo archivarse: se muestra para no perder la elección.
  const archivedRewardService =
    program?.reward_service_id && !services.some((s) => s.id === program.reward_service_id)
      ? program.reward_service_id
      : null;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Premio por fidelidad</h1>
      <p className="text-brand-muted">
        Cada cierto número de visitas, tu cliente gana un premio. En la visita que lo completa, el sistema avisa a quien
        registra.
      </p>
      {program ? null : (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">
          Configura tu premio por fidelidad para empezar a registrar visitas.
        </p>
      )}
      {archivedRewardService ? (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900">
          El servicio gratis del premio fue archivado. Elige otro servicio para los ciclos nuevos.
        </p>
      ) : null}
      <LoyaltyForm organizationId={business.id} services={services} initialValues={initialValues} isNew={!program} />
    </section>
  );
}
