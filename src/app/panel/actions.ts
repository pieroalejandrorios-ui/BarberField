"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // Aun si falla la revocación remota, se borran las cookies locales.
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) console.error("No se pudo cerrar la sesión en Supabase.");
  redirect("/login");
}
