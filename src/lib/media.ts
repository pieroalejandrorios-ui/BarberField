import { getSupabaseConfig } from "@/lib/supabase/config";

export const MEDIA_BUCKET = "business-media";
export type MediaKind = "logo" | "cover" | "gallery";

const MEDIA_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$/;

// Misma regla que `private.is_business_media_path`.
export function isMediaPath(organizationId: string, kind: MediaKind, path: string): boolean {
  const prefix = `${organizationId}/${kind}/`;
  return path.startsWith(prefix) && MEDIA_FILE_PATTERN.test(path.slice(prefix.length));
}

// El bucket es de lectura pública: la URL se sirve directamente.
export function publicMediaUrl(path: string): string {
  const { url } = getSupabaseConfig();
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}
