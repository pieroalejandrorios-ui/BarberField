import type { Metadata } from "next";
import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { requireAccount } from "@/lib/session";
import { formatPhone } from "@/lib/validation/phone";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Mi perfil · Barber Field" };

export default async function ProfilePage() {
  const { supabase, userId, email, account } = await requireAccount();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("phone, terms_version, terms_accepted_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar tu perfil.");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2" aria-labelledby="profile-heading">
        <h1 id="profile-heading" className="text-2xl font-semibold">Mi perfil</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
          <dt className="text-brand-muted">Correo</dt>
          <dd className="break-all">{email}</dd>
          <dt className="text-brand-muted">Cuenta</dt>
          <dd>{account.isPro ? "Pro (dueño)" : "Normal"}</dd>
          {profile?.terms_accepted_at ? (
            <>
              <dt className="text-brand-muted">Términos</dt>
              <dd>
                Versión {profile.terms_version}, aceptada el {formatDate(profile.terms_accepted_at)} ·{" "}
                <Link href="/terminos" className="underline">ver</Link>
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-brand-line p-4" aria-labelledby="phone-heading">
        <h2 id="phone-heading" className="text-lg font-semibold">Celular</h2>
        <p className="text-sm text-brand-muted">
          Por ahora solo se guarda. Tus visitas se vinculan con tu correo verificado; el celular se usará cuando podamos
          verificarlo.
        </p>
        <ProfileForm phone={profile?.phone ? formatPhone(profile.phone) : ""} />
      </section>

      <Link href="/panel/mis-visitas" className="font-medium underline">Ver mis visitas</Link>
    </div>
  );
}
