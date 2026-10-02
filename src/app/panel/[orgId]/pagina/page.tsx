import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { buttonClass, secondaryButtonClass } from "@/components/ui";
import { publicMediaUrl } from "@/lib/media";
import { requireOwner, requireUser } from "@/lib/session";
import { rowsToDays } from "@/lib/validation/hours";
import { formatPhone } from "@/lib/validation/phone";
import { deletePhoto, movePhoto, setBarbershopImage, setPublished } from "./actions";
import { CaptionForm } from "./caption-form";
import { DetailsForm } from "./details-form";
import { HoursForm } from "./hours-form";
import { LinksForm } from "./links-form";
import { MediaUploadButton } from "./media-upload";

export const metadata: Metadata = { title: "Página pública · Barber Field" };

const MAX_PHOTOS = 20;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-xl border border-brand-line p-4">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function PublicPageEditor({ params }: PageProps<"/panel/[orgId]/pagina">) {
  const { orgId } = await params;
  const business = await requireOwner(orgId);
  const { supabase } = await requireUser();

  const { data: shop, error } = await supabase
    .from("barbershops")
    .select("id, name, slug, description, address, district, city, phone, maps_url, hours_note, logo_path, cover_path, is_published")
    .eq("organization_id", business.id)
    .is("archived_at", null)
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw new Error("No se pudo cargar la página.");

  const [hours, links, photos] = await Promise.all([
    supabase.from("business_hours").select("weekday, opens_at, closes_at").eq("barbershop_id", shop.id).order("weekday").order("slot"),
    supabase.from("business_social_links").select("platform, url").eq("barbershop_id", shop.id),
    supabase.from("business_photos").select("id, storage_path, caption").eq("barbershop_id", shop.id).order("sort_order").order("created_at"),
  ]);
  if (hours.error || links.error || photos.error) throw new Error("No se pudo cargar la página.");

  const linkValues = Object.fromEntries(links.data.map((link) => [link.platform, link.url]));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Página pública</h1>
        <p className="text-brand-muted">
          {shop.is_published ? "Tu página está publicada." : "Tu página aún no está publicada: nadie más puede verla."}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ActionButton
            action={setPublished.bind(null, business.id, !shop.is_published)}
            label={shop.is_published ? "Despublicar" : "Publicar página"}
            className={shop.is_published ? `${secondaryButtonClass} sm:w-auto` : `${buttonClass} sm:w-auto`}
          />
          {shop.is_published && shop.slug ? (
            <Link href={`/b/${shop.slug}`} target="_blank" className={`${secondaryButtonClass} sm:w-auto`}>
              Ver página pública
            </Link>
          ) : null}
        </div>
      </section>

      <Section id="details-heading" title="Datos">
        <DetailsForm
          organizationId={business.id}
          initialValues={{
            name: shop.name,
            slug: shop.slug ?? "",
            description: shop.description ?? "",
            address: shop.address ?? "",
            district: shop.district ?? "",
            city: shop.city ?? "",
            phone: shop.phone ? formatPhone(shop.phone) : "",
            mapsUrl: shop.maps_url ?? "",
          }}
        />
      </Section>

      <Section id="images-heading" title="Logo y portada">
        {(
          [
            { kind: "logo", label: "Logo", path: shop.logo_path, width: 128, height: 128 },
            { kind: "cover", label: "Portada", path: shop.cover_path, width: 640, height: 320 },
          ] as const
        ).map(({ kind, label, path, width, height }) => (
          <div key={kind} className="flex flex-col gap-2">
            <h3 className="font-medium">{label}</h3>
            {path ? (
              <Image
                src={publicMediaUrl(path)}
                alt={`${label} actual`}
                width={width}
                height={height}
                className="max-w-full rounded-xl border border-brand-line object-cover"
                style={{ aspectRatio: `${width} / ${height}` }}
              />
            ) : (
              <p className="text-sm text-brand-muted">Sin {label.toLowerCase()}.</p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <MediaUploadButton organizationId={business.id} kind={kind} label={path ? `Cambiar ${label.toLowerCase()}` : `Subir ${label.toLowerCase()}`} />
              {path ? (
                <ActionButton action={setBarbershopImage.bind(null, business.id, kind, null)} label="Quitar" accessibleLabel={`Quitar ${label.toLowerCase()}`} />
              ) : null}
            </div>
          </div>
        ))}
      </Section>

      <Section id="gallery-heading" title={`Galería (${photos.data.length} de ${MAX_PHOTOS})`}>
        <MediaUploadButton
          organizationId={business.id}
          kind="gallery"
          label="Agregar foto"
          disabled={photos.data.length >= MAX_PHOTOS}
        />
        {photos.data.length === 0 ? (
          <p className="text-sm text-brand-muted">Muestra tu local y tus mejores cortes.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {photos.data.map((photo, index) => (
              <li key={photo.id} className="flex flex-col gap-2 rounded-xl border border-brand-line p-3">
                <Image
                  src={publicMediaUrl(photo.storage_path)}
                  alt={photo.caption ?? `Foto ${index + 1}`}
                  width={400}
                  height={300}
                  className="aspect-[4/3] w-full rounded object-cover"
                />
                <CaptionForm organizationId={business.id} photoId={photo.id} caption={photo.caption ?? ""} position={index + 1} />
                <div className="flex flex-wrap gap-2">
                  <ActionButton action={movePhoto.bind(null, business.id, photo.id, "up")} label="↑" accessibleLabel={`Mover la foto ${index + 1} antes`} disabled={index === 0} />
                  <ActionButton action={movePhoto.bind(null, business.id, photo.id, "down")} label="↓" accessibleLabel={`Mover la foto ${index + 1} después`} disabled={index === photos.data.length - 1} />
                  <ActionButton action={deletePhoto.bind(null, business.id, photo.id)} label="Eliminar" accessibleLabel={`Eliminar la foto ${index + 1}`} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="hours-heading" title="Horario de atención">
        <HoursForm organizationId={business.id} initialDays={rowsToDays(hours.data)} initialNote={shop.hours_note ?? ""} />
      </Section>

      <Section id="links-heading" title="Redes sociales">
        <LinksForm organizationId={business.id} initialValues={linkValues} />
      </Section>
    </div>
  );
}
