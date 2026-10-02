import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import { isUuid } from "@/lib/validation/uuid";

export type Business = { id: string; name: string; role: Enums<"member_role"> };

// Para páginas públicas: id del usuario si hay sesión válida, o null.
export const getOptionalUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  return error ? null : (data?.claims.sub ?? null);
});

// Verifica el JWT en el servidor; sin sesión válida redirige a /login.
// `cache` evita repetir la verificación entre el layout y la página.
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId) redirect("/login");

  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  return { supabase, userId, email };
});

export type Account = { isPro: boolean; termsAccepted: boolean; ownerTermsPending: boolean };

// Estado de la cuenta calculado por la base de datos con `private.is_pro`
// (único punto de control del acceso Pro).
export const getAccount = cache(async (): Promise<Account> => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("get_my_account").single();
  if (error) throw new Error("No se pudo cargar tu cuenta.");
  return {
    isPro: data.is_pro,
    termsAccepted: data.terms_accepted,
    ownerTermsPending: data.owner_terms_pending,
  };
});

// Sesión con los términos vigentes aceptados (y las condiciones de dueño si
// es Pro). Lo usan el layout del panel y, a través de `getMyBusinesses`, cada
// página y Server Action del panel.
export const requireAccount = cache(async () => {
  const user = await requireUser();
  const account = await getAccount();
  if (!account.termsAccepted || account.ownerTermsPending) redirect("/aceptar-terminos");
  return { ...user, account };
});

// Negocios no archivados donde el usuario tiene membresía activa (RLS ya
// oculta los demás; el filtro de membresía añade el rol).
export const getMyBusinesses = cache(async (): Promise<Business[]> => {
  const { supabase, userId } = await requireAccount();

  const [organizations, memberships] = await Promise.all([
    supabase.from("organizations").select("id, name").order("name"),
    supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", userId)
      .eq("is_active", true),
  ]);
  if (organizations.error || memberships.error) {
    throw new Error("No se pudieron cargar tus barberías.");
  }

  const roles = new Map(memberships.data.map((m) => [m.organization_id, m.role]));
  return organizations.data.flatMap((org) => {
    const role = roles.get(org.id);
    return role ? [{ id: org.id, name: org.name, role }] : [];
  });
});

// Membresía activa en el negocio; si no la tiene, la ruta no existe para él.
export async function requireMembership(organizationId: string): Promise<Business> {
  if (!isUuid(organizationId)) notFound();
  const business = (await getMyBusinesses()).find((b) => b.id === organizationId);
  if (!business) notFound();
  return business;
}

// Páginas solo para el dueño: para el trabajador la ruta no existe.
// El dueño debe tener cuenta Pro (la base de datos también lo exige).
export async function requireOwner(organizationId: string): Promise<Business> {
  const business = await requireMembership(organizationId);
  if (business.role !== "owner" || !(await getAccount()).isPro) notFound();
  return business;
}

// Server Actions del dueño: devuelve null en vez de lanzar, para mostrar un
// mensaje. RLS y las funciones vuelven a verificar el permiso.
export async function getOwnedBusiness(organizationId: unknown): Promise<Business | null> {
  if (!isUuid(organizationId)) return null;
  const business = (await getMyBusinesses()).find((b) => b.id === organizationId);
  return business?.role === "owner" && (await getAccount()).isPro ? business : null;
}

// Server Actions de cualquier miembro activo (dueño o trabajador).
export async function getMemberBusiness(organizationId: unknown): Promise<Business | null> {
  if (!isUuid(organizationId)) return null;
  return (await getMyBusinesses()).find((b) => b.id === organizationId) ?? null;
}
