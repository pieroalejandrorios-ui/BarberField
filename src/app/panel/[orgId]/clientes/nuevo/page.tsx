import type { Metadata } from "next";
import Link from "next/link";
import { requireMembership } from "@/lib/session";
import { NewCustomerForm } from "./new-customer-form";

export const metadata: Metadata = { title: "Nuevo cliente · Barber Field" };

export default async function NewCustomerPage({ params }: PageProps<"/panel/[orgId]/clientes/nuevo">) {
  const { orgId } = await params;
  const business = await requireMembership(orgId);

  return (
    <section className="flex flex-col gap-4">
      <Link href={`/panel/${business.id}/clientes`} className="text-sm underline">
        ← Clientes
      </Link>
      <h1 className="text-2xl font-semibold">Nuevo cliente</h1>
      <NewCustomerForm organizationId={business.id} />
    </section>
  );
}
