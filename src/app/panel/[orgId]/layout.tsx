import { requireMembership } from "@/lib/session";
import { BusinessNav } from "./business-nav";
import { FixedCta } from "@/components/fixed-cta";

// Verifica la membresía para todo el negocio. Cada página y Server Action
// vuelve a verificarla, y el trabajador no ve los enlaces solo para el dueño.
export default async function BusinessLayout({ children, params }: LayoutProps<"/panel/[orgId]">) {
  const { orgId } = await params;
  const business = await requireMembership(orgId);

  const links = [
    { href: `/panel/${business.id}`, label: "Inicio" },
    { href: `/panel/${business.id}/visitas/nueva`, label: "Nueva visita" },
    { href: `/panel/${business.id}/clientes`, label: "Clientes" },
    { href: `/panel/${business.id}/servicios`, label: "Servicios" },
    { href: `/panel/${business.id}/premio`, label: "Premio" },
    ...(business.role === "owner"
      ? [
          { href: `/panel/${business.id}/pagina`, label: "Página" },
          { href: `/panel/${business.id}/equipo`, label: "Equipo" },
          { href: `/panel/${business.id}/reportes`, label: "Reportes" },
          { href: `/panel/${business.id}/auditoria`, label: "Auditoría" },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-brand-muted">
          {business.name} · {business.role === "owner" ? "Dueño" : "Trabajador"}
        </p>
        <BusinessNav links={links} />
      </div>
      {children}
      <FixedCta href={`/panel/${business.id}/visitas/nueva`} label="Registrar visita" note="Cada experiencia cuenta. Una razón más para volver" />
    </div>
  );
}
