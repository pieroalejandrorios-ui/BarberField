import type { Metadata } from "next";
import { formatPEN, moneyToInput } from "@/lib/money";
import { requireMembership, requireUser } from "@/lib/session";
import type { Tables } from "@/lib/supabase/database.types";
import { moveService, setServiceArchived } from "./actions";
import { ActionButton } from "@/components/action-button";
import { ServiceForm } from "./service-forms";

export const metadata: Metadata = { title: "Servicios · Barber Field" };

type Service = Pick<
  Tables<"services">,
  "id" | "name" | "description" | "price" | "duration_minutes" | "is_published" | "archived_at"
>;

function ServiceSummary({ service }: { service: Service }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-medium">{service.name}</h3>
        <span className="font-semibold tabular-nums">{formatPEN(service.price)}</span>
      </div>
      {service.description ? (
        <p className="text-sm whitespace-pre-line text-brand-muted">{service.description}</p>
      ) : null}
      <p className="text-sm text-brand-muted">
        {[
          service.duration_minutes ? `${service.duration_minutes} min` : null,
          service.is_published ? null : "No se muestra en la página pública",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

export default async function ServicesPage({ params }: PageProps<"/panel/[orgId]/servicios">) {
  const { orgId } = await params;
  const business = await requireMembership(orgId);
  const isOwner = business.role === "owner";
  const { supabase } = await requireUser();

  const { data: services, error } = await supabase
    .from("services")
    .select("id, name, description, price, duration_minutes, is_published, archived_at")
    .eq("organization_id", business.id)
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error("No se pudieron cargar los servicios.");

  const active = services.filter((service) => service.archived_at === null);
  const archived = services.filter((service) => service.archived_at !== null);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Servicios y precios</h1>
        {isOwner ? (
          <details className="rounded-xl border border-brand-line p-4">
            <summary className="min-h-11 cursor-pointer content-center font-medium">Agregar servicio</summary>
            <div className="pt-4">
              <ServiceForm organizationId={business.id} />
            </div>
          </details>
        ) : (
          <p className="text-sm text-brand-muted">Solo el dueño puede cambiar los servicios.</p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="active-heading">
        <h2 id="active-heading" className="sr-only">
          Servicios activos
        </h2>
        {active.length === 0 ? (
          <p className="text-brand-muted">
            {isOwner ? "Agrega tu primer servicio, por ejemplo «Corte clásico»." : "Aún no hay servicios."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-brand-line rounded-xl border border-brand-line">
            {active.map((service, index) => (
              <li key={service.id} className="flex flex-col gap-3 px-4 py-3">
                <ServiceSummary service={service} />
                {isOwner ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        action={moveService.bind(null, business.id, service.id, "up")}
                        label="↑ Subir"
                        accessibleLabel={`Subir ${service.name}`}
                        disabled={index === 0}
                      />
                      <ActionButton
                        action={moveService.bind(null, business.id, service.id, "down")}
                        label="↓ Bajar"
                        accessibleLabel={`Bajar ${service.name}`}
                        disabled={index === active.length - 1}
                      />
                      <ActionButton
                        action={setServiceArchived.bind(null, business.id, service.id, true)}
                        label="Archivar"
                        accessibleLabel={`Archivar ${service.name}`}
                      />
                    </div>
                    <details>
                      <summary className="min-h-11 cursor-pointer content-center text-sm font-medium underline">
                        Editar
                      </summary>
                      <div className="pt-3">
                        <ServiceForm
                          organizationId={business.id}
                          serviceId={service.id}
                          initialValues={{
                            name: service.name,
                            description: service.description ?? "",
                            price: moneyToInput(service.price),
                            durationMinutes: service.duration_minutes?.toString() ?? "",
                            isPublished: service.is_published,
                          }}
                        />
                      </div>
                    </details>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && archived.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="archived-heading">
          <h2 id="archived-heading" className="text-lg font-semibold">
            Archivados
          </h2>
          <p className="text-sm text-brand-muted">
            No se muestran en la página ni se pueden usar en visitas nuevas.
          </p>
          <ul className="flex flex-col divide-y divide-brand-line rounded-xl border border-brand-line">
            {archived.map((service) => (
              <li
                key={service.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <ServiceSummary service={service} />
                <ActionButton
                  action={setServiceArchived.bind(null, business.id, service.id, false)}
                  label="Restaurar"
                  accessibleLabel={`Restaurar ${service.name}`}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
