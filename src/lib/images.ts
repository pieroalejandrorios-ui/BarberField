// Preparación de fotos en el navegador antes de subirlas a Storage.

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");

export type PreparedImage = { blob: Blob; extension: "webp" | "jpg"; contentType: "image/webp" | "image/jpeg" };

function isAllowedType(type: string): boolean {
  return IMAGE_TYPES.some((allowed) => allowed === type);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Redimensiona para que el lado mayor no supere `maxSide` y convierte a WebP
// (o JPEG si el navegador no codifica WebP).
export async function prepareImage(
  file: File,
  maxSide: number,
): Promise<{ ok: true; image: PreparedImage } | { ok: false; error: string }> {
  if (!isAllowedType(file.type)) return { ok: false, error: "Usa una imagen JPG, PNG o WebP." };
  if (file.size > IMAGE_MAX_BYTES) return { ok: false, error: "La imagen pesa más de 5 MB." };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, error: "No se pudo leer la imagen." };
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return { ok: false, error: "Tu navegador no puede procesar la imagen." };
  }
  try {
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }

  const webp = await canvasToBlob(canvas, "image/webp", 0.85);
  if (webp && webp.type === "image/webp" && webp.size <= IMAGE_MAX_BYTES) {
    return { ok: true, image: { blob: webp, extension: "webp", contentType: "image/webp" } };
  }
  const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.85);
  if (!jpeg) return { ok: false, error: "No se pudo procesar la imagen." };
  if (jpeg.size > IMAGE_MAX_BYTES) return { ok: false, error: "La imagen sigue pesando más de 5 MB." };
  return { ok: true, image: { blob: jpeg, extension: "jpg", contentType: "image/jpeg" } };
}
