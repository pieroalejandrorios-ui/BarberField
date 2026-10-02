"use server";

import { revalidatePath } from "next/cache";
import { requireAccount } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { normalizeMobile } from "@/lib/validation/phone";

export type ProfileState = { status: "idle" | "error" | "success"; message?: string; fieldError?: string; phone: string };

export async function saveProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const raw = formData.get("phone");
  const phone = typeof raw === "string" ? raw.trim() : "";
  const normalized = phone.length > 0 ? normalizeMobile(phone) : null;
  if (phone.length > 0 && !normalized) {
    return { status: "error", fieldError: "Escribe un celular de 9 dígitos que empiece en 9.", phone };
  }

  const { supabase } = await requireAccount();
  const { error } = await supabase.rpc("save_my_profile", { p_phone: normalized });
  if (error) return { status: "error", message: dbErrorMessage(error), phone };

  revalidatePath("/panel/perfil");
  return { status: "success", message: normalized ? "Celular guardado." : "Celular eliminado.", phone };
}
