import type { Metadata } from "next";
import Link from "next/link";
import { getMyBusinesses } from "@/lib/session";
import { CreateBusinessForm } from "./create-business-form";

export const metadata: Metadata = { title: "Crear barbería · Barber Field" };

export default async function NewBusinessPage() {
  const businesses = await getMyBusinesses();
  const workplace = businesses.find((b) => b.role === "barber");

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Crear mi barbería</h1>
      {workplace ? (
        // La base de datos también lo rechaza; aquí solo se explica.
        <div className="flex flex-col gap-3 rounded-xl bg-brand-soft p-4">
          <p>
            Trabajas en <strong>{workplace.name}</strong>. Mientras seas trabajador activo de una barbería,
            no puedes crear una propia.
          </p>
          <Link href={`/panel/${workplace.id}`} className="font-medium underline">
            Ir a {workplace.name}
          </Link>
        </div>
      ) : (
        <CreateBusinessForm />
      )}
    </section>
  );
}
