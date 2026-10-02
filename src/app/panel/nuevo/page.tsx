import type { Metadata } from "next";
import { getMyBusinesses } from "@/lib/session";
import { CreateBusinessForm } from "./create-business-form";

export const metadata: Metadata = { title: "Crear barbería · Barber Field" };

export default async function NewBusinessPage() {
  // Verifica sesión y términos; desde la etapa 11 cualquier cuenta puede crear.
  await getMyBusinesses();

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Crear mi barbería</h1>
      <p className="rounded-xl bg-brand-soft p-4 text-sm">
        Al crear tu barbería, tu cuenta pasa a ser <strong>Pro</strong>: podrás registrar visitas, configurar
        premios, ver reportes y auditoría, armar tu equipo y publicar tu página. Por ahora es gratis. Si trabajas
        en otras barberías, sigues teniendo acceso a ellas.
      </p>
      <CreateBusinessForm />
    </section>
  );
}
