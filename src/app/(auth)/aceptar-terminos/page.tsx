import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccount, requireUser } from "@/lib/session";
import { signOut } from "@/app/panel/actions";
import { AcceptTermsForm } from "./accept-terms-form";
import { HOME_PATH } from "@/lib/home";

export const metadata: Metadata = { title: "Aceptar términos · Barber Field" };

export default async function AcceptTermsPage() {
  await requireUser();
  const account = await getAccount();
  if (account.termsAccepted && !account.ownerTermsPending) redirect(HOME_PATH);

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Actualizamos nuestros términos</h1>
        <p className="text-brand-muted">
          Para seguir usando Barber Field, revisa y acepta los documentos vigentes.
        </p>
      </div>
      <AcceptTermsForm askOwnerTerms={account.ownerTermsPending} />
      <form action={signOut}>
        <button type="submit" className="min-h-11 w-full text-sm font-medium underline">
          Cerrar sesión
        </button>
      </form>
    </>
  );
}
