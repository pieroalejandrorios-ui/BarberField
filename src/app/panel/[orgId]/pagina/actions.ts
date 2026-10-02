"use server";

import { revalidatePath } from "next/cache";
import { MEDIA_BUCKET, isMediaPath } from "@/lib/media";
import { getOwnedBusiness, requireUser } from "@/lib/session";
import { dbErrorMessage } from "@/lib/supabase/errors";
import { parseHours } from "@/lib/validation/hours";
import {
  HOURS_NOTE_MAX_LENGTH,
  SOCIAL_PLATFORMS,
  validateCaption,
  validatePageDetails,
  validateSocialUrl,
  type PageDetailsErrors,
  type PageDetailsValues,
} from "@/lib/validation/page";
import { isUuid } from "@/lib/validation/uuid";

export type ActionResult = { message?: string };

export type DetailsFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: PageDetailsErrors;
  values?: PageDetailsValues;
};

export type HoursFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  dayErrors?: Record<number, string>;
  noteError?: string;
};

export type LinksFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Partial<Record<string, string>>;
  values?: Record<string, string>;
};

export type CaptionFormState = { status: "idle" | "error" | "success"; message?: string };

const NO_PERMISSION = "No tienes permiso para editar esta página.";

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// Dueño y su único local activo (v1). RLS vuelve a verificar cada escritura.
async function getOwnedShop(organizationId: unknown) {
  const business = await getOwnedBusiness(organizationId);
  if (!business) return null;

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("barbershops")
    .select("id, slug, logo_path, cover_path")
    .eq("organization_id", business.id)
    .is("archived_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { business, shop: data, supabase };
}

function revalidate(organizationId: string, slug: string | null) {
  revalidatePath(`/panel/${organizationId}/pagina`);
  revalidatePath(`/panel/${organizationId}`, "layout");
  if (slug) revalidatePath(`/b/${slug}`);
}

// Borra archivos que ya no se usan. Un fallo deja un archivo huérfano, pero
// no deshace el cambio ya guardado.
async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { supabase } = await requireUser();
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
  if (error) console.error("No se pudo borrar un archivo de Storage.");
}

// ---------------------------------------------------------------------------
// Datos generales
// ---------------------------------------------------------------------------

export async function updatePageDetails(
  organizationId: string,
  _prev: DetailsFormState,
  formData: FormData,
): Promise<DetailsFormState> {
  const values: PageDetailsValues = {
    name: readText(formData, "name"),
    slug: readText(formData, "slug"),
    description: readText(formData, "description"),
    address: readText(formData, "address"),
    district: readText(formData, "district"),
    city: readText(formData, "city"),
    phone: readText(formData, "phone"),
    mapsUrl: readText(formData, "mapsUrl"),
  };

  const owned = await getOwnedShop(organizationId);
  if (!owned) return { status: "error", message: NO_PERMISSION, values };

  const result = validatePageDetails(values);
  if (!result.ok) return { status: "error", errors: result.errors, values };
  const { data } = result;

  const { error } = await owned.supabase
    .from("barbershops")
    .update({
      name: data.name,
      slug: data.slug,
      description: data.description,
      address: data.address,
      district: data.district,
      city: data.city,
      phone: data.phone,
      maps_url: data.mapsUrl,
    })
    .eq("id", owned.shop.id);
  if (error) {
    if (error.code === "23505") {
      return { status: "error", errors: { slug: "Ese enlace ya está en uso. Prueba con otro." }, values };
    }
    return { status: "error", message: dbErrorMessage(error), values };
  }

  // El nombre del negocio y el del local son el mismo en la interfaz.
  const { error: orgError } = await owned.supabase
    .from("organizations")
    .update({ name: data.name })
    .eq("id", owned.business.id);
  if (orgError) return { status: "error", message: dbErrorMessage(orgError), values };

  revalidate(owned.business.id, owned.shop.slug);
  if (data.slug !== owned.shop.slug) revalidatePath(`/b/${data.slug}`);
  return { status: "success", message: "Cambios guardados." };
}

export async function setPublished(organizationId: string, published: boolean): Promise<ActionResult> {
  const owned = await getOwnedShop(organizationId);
  if (!owned) return { message: NO_PERMISSION };

  const { error } = await owned.supabase
    .from("barbershops")
    .update({ is_published: published })
    .eq("id", owned.shop.id);
  if (error) return { message: dbErrorMessage(error) };

  revalidate(owned.business.id, owned.shop.slug);
  return {};
}

// ---------------------------------------------------------------------------
// Logo y portada
// ---------------------------------------------------------------------------

export async function setBarbershopImage(
  organizationId: string,
  kind: "logo" | "cover",
  path: string | null,
): Promise<ActionResult> {
  const owned = await getOwnedShop(organizationId);
  if (!owned || (kind !== "logo" && kind !== "cover")) return { message: NO_PERMISSION };
  if (path !== null && !isMediaPath(owned.business.id, kind, path)) {
    return { message: "La imagen no es válida. Vuelve a subirla." };
  }

  const previous = kind === "logo" ? owned.shop.logo_path : owned.shop.cover_path;
  const { error } = await owned.supabase
    .from("barbershops")
    .update(kind === "logo" ? { logo_path: path } : { cover_path: path })
    .eq("id", owned.shop.id);
  if (error) return { message: dbErrorMessage(error) };

  if (previous && previous !== path) await removeFiles([previous]);
  revalidate(owned.business.id, owned.shop.slug);
  return {};
}

// ---------------------------------------------------------------------------
// Galería
// ---------------------------------------------------------------------------

export async function addGalleryPhoto(organizationId: string, path: string): Promise<ActionResult> {
  const owned = await getOwnedShop(organizationId);
  if (!owned) return { message: NO_PERMISSION };
  if (!isMediaPath(owned.business.id, "gallery", path)) {
    return { message: "La imagen no es válida. Vuelve a subirla." };
  }

  const { data: last, error: lastError } = await owned.supabase
    .from("business_photos")
    .select("sort_order")
    .eq("barbershop_id", owned.shop.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return { message: dbErrorMessage(lastError) };

  const { error } = await owned.supabase.from("business_photos").insert({
    organization_id: owned.business.id,
    barbershop_id: owned.shop.id,
    storage_path: path,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) {
    return { message: dbErrorMessage(error, { PT008: "Ya tienes 20 fotos. Elimina alguna para subir otra." }) };
  }

  revalidate(owned.business.id, owned.shop.slug);
  return {};
}

export async function updatePhotoCaption(
  organizationId: string,
  photoId: string,
  _prev: CaptionFormState,
  formData: FormData,
): Promise<CaptionFormState> {
  const owned = await getOwnedShop(organizationId);
  if (!owned || !isUuid(photoId)) return { status: "error", message: NO_PERMISSION };

  const caption = readText(formData, "caption").trim();
  const captionError = validateCaption(caption);
  if (captionError) return { status: "error", message: captionError };

  const { data, error } = await owned.supabase
    .from("business_photos")
    .update({ caption: caption.length > 0 ? caption : null })
    .eq("barbershop_id", owned.shop.id)
    .eq("id", photoId)
    .select("id");
  if (error) return { status: "error", message: dbErrorMessage(error) };
  if (data.length !== 1) return { status: "error", message: "No se encontró la foto. Recarga la página." };

  revalidate(owned.business.id, owned.shop.slug);
  return { status: "success", message: "Leyenda guardada." };
}

export async function movePhoto(
  organizationId: string,
  photoId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const owned = await getOwnedShop(organizationId);
  if (!owned || !isUuid(photoId)) return { message: NO_PERMISSION };

  const { data: photos, error } = await owned.supabase
    .from("business_photos")
    .select("id")
    .eq("barbershop_id", owned.shop.id)
    .order("sort_order")
    .order("created_at");
  if (error) return { message: dbErrorMessage(error) };

  const index = photos.findIndex((photo) => photo.id === photoId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1) return { message: "No se encontró la foto. Recarga la página." };
  if (target < 0 || target >= photos.length) return {};

  // Como máximo 20 fotos: se renumera la lista completa en el nuevo orden.
  const ids = photos.map((photo) => photo.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  for (const [position, id] of ids.entries()) {
    const { error: updateError } = await owned.supabase
      .from("business_photos")
      .update({ sort_order: position + 1 })
      .eq("barbershop_id", owned.shop.id)
      .eq("id", id);
    if (updateError) return { message: dbErrorMessage(updateError) };
  }

  revalidate(owned.business.id, owned.shop.slug);
  return {};
}

export async function deletePhoto(organizationId: string, photoId: string): Promise<ActionResult> {
  const owned = await getOwnedShop(organizationId);
  if (!owned || !isUuid(photoId)) return { message: NO_PERMISSION };

  const { data, error } = await owned.supabase
    .from("business_photos")
    .delete()
    .eq("barbershop_id", owned.shop.id)
    .eq("id", photoId)
    .select("storage_path");
  if (error) return { message: dbErrorMessage(error) };
  if (data.length !== 1) return { message: "No se encontró la foto. Recarga la página." };

  await removeFiles(data.map((photo) => photo.storage_path));
  revalidate(owned.business.id, owned.shop.slug);
  return {};
}

// ---------------------------------------------------------------------------
// Horario
// ---------------------------------------------------------------------------

export async function saveHours(
  organizationId: string,
  _prev: HoursFormState,
  payload: { days: unknown; note: unknown },
): Promise<HoursFormState> {
  const owned = await getOwnedShop(organizationId);
  if (!owned) return { status: "error", message: NO_PERMISSION };

  const parsed = parseHours(payload.days);
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  const noteError =
    note.length > HOURS_NOTE_MAX_LENGTH ? `La nota puede tener hasta ${HOURS_NOTE_MAX_LENGTH} caracteres.` : undefined;
  if (!parsed.ok || noteError) {
    return {
      status: "error",
      dayErrors: parsed.ok ? undefined : parsed.errors,
      noteError,
      message: "Revisa el horario.",
    };
  }

  const { error } = await owned.supabase.rpc("save_business_hours", {
    p_barbershop_id: owned.shop.id,
    p_hours: parsed.rows,
  });
  if (error) return { status: "error", message: dbErrorMessage(error) };

  const { error: noteSaveError } = await owned.supabase
    .from("barbershops")
    .update({ hours_note: note.length > 0 ? note : null })
    .eq("id", owned.shop.id);
  if (noteSaveError) return { status: "error", message: dbErrorMessage(noteSaveError) };

  revalidate(owned.business.id, owned.shop.slug);
  return { status: "success", message: "Horario guardado." };
}

// ---------------------------------------------------------------------------
// Redes sociales
// ---------------------------------------------------------------------------

export async function saveSocialLinks(
  organizationId: string,
  _prev: LinksFormState,
  formData: FormData,
): Promise<LinksFormState> {
  const values: Record<string, string> = {};
  for (const { platform } of SOCIAL_PLATFORMS) values[platform] = readText(formData, platform).trim();

  const owned = await getOwnedShop(organizationId);
  if (!owned) return { status: "error", message: NO_PERMISSION, values };

  const errors: Record<string, string> = {};
  const links: Array<{ platform: string; url: string }> = [];
  for (const { platform } of SOCIAL_PLATFORMS) {
    const url = values[platform];
    if (url.length === 0) continue;
    const urlError = validateSocialUrl(url);
    if (urlError) errors[platform] = urlError;
    else links.push({ platform, url });
  }
  if (Object.keys(errors).length > 0) return { status: "error", errors, values };

  const { error } = await owned.supabase.rpc("save_social_links", {
    p_barbershop_id: owned.shop.id,
    p_links: links,
  });
  if (error) return { status: "error", message: dbErrorMessage(error), values };

  revalidate(owned.business.id, owned.shop.slug);
  return { status: "success", message: "Redes guardadas." };
}
