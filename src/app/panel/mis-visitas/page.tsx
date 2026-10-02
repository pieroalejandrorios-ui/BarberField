import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { parseMyVisits, type MyVisitsItem } from "@/lib/my-visits";
import { requireAccount } from "@/lib/session";

export const metadata: Metadata = { title: "Mis visitas · Barber Field" };

function Progress({ item }: { item: MyVisitsItem }) {
  if (item.visitsRequired === null || item.progress === null || item.visitsRemaining === null) {
    return <p className="text-sm text-brand-muted">Esta barbería aún no configuró su premio por fidelidad.</p>;
  }
  const required = item.visitsRequired;
  const showDots = required <= 12;

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">Visitas para tu próximo premio</span>
        <span className="text-2xl font-semibold tabular-nums">
          {item.progress} <span className="text-base font-normal text-brand-muted">de {required}</span>
        </span>
      </p>
      {showDots ? (
        <ol aria-hidden="true" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${required}, minmax(0, 1fr))` }}>
          {Array.from({ length: required }, (_, index) => (
            <li
              key={index}
              className={`h-2.5 rounded-full ${index < (item.progress ?? 0) ? "bg-brand-ink" : "border border-dashed border-[#879774]"}`}
            />
          ))}
        </ol>
      ) : (
        <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-brand-soft">
          <div className="h-full bg-brand-ink" style={{ width: `${Math.round((item.progress / required) * 100)}%` }} />
        </div>
      )}
      <p className="rounded-xl bg-[#f0f4e3] p-3 text-sm font-semibold">
        {item.visitsRemaining === 1
          ? "Te falta 1 visita para el premio."
          : `Te faltan ${item.visitsRemaining} visitas para el premio.`}
      </p>
      {item.programPaused ? (
        <p className="text-sm text-brand-muted">La promoción está pausada: por ahora las visitas no suman.</p>
      ) : null}
    </div>
  );
}

export default async function MyVisitsPage() {
  const { supabase, email } = await requireAccount();
  const { data, error } = await supabase.rpc("get_my_visits");
  if (error) throw new Error("No se pudieron cargar tus visitas.");
  const result = parseMyVisits(data);
  if (!result) throw new Error("No se pudieron cargar tus visitas.");

  return (
    <section className="flex flex-col gap-6" aria-labelledby="my-visits-heading">
      <div className="flex flex-col gap-2">
        <h1 id="my-visits-heading" className="text-2xl font-semibold">Mis visitas</h1>
        <p className="text-brand-muted">Tus visitas en cada barbería y cuánto te falta para el premio. Solo lectura.</p>
      </div>

      {result.status === "disabled" ? (
        <EmptyState
          title="Muy pronto"
          description="Estamos activando la verificación de correo. Cuando esté lista, verás aquí tus visitas en las barberías que registren tu correo."
        />
      ) : result.status === "unverified" ? (
        <EmptyState
          title="Tu correo aún no está verificado"
          description={`Para proteger tus datos, solo mostramos visitas a cuentas con el correo verificado. Las cuentas creadas antes de activar la verificación todavía no pueden usar esta función. Tu correo: ${email}.`}
        />
      ) : result.items.length === 0 ? (
        <EmptyState
          title="Aún no tienes visitas vinculadas"
          description={`Pide en tu barbería que registren tu correo (${email}) en tu ficha de cliente. Después verás aquí tus visitas.`}
          action={{ href: "/barberias", label: "Explorar barberías" }}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {result.items.map((item, index) => (
            <li key={`${item.slug ?? item.barbershopName}-${index}`} className="flex flex-col gap-4 rounded-2xl border border-brand-line bg-white p-5">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">
                  {item.slug ? (
                    <Link href={`/b/${item.slug}`} className="underline-offset-4 hover:underline">{item.barbershopName}</Link>
                  ) : (
                    item.barbershopName
                  )}
                </h2>
                <p className="text-sm text-brand-muted">
                  {[item.district, item.totalVisits === 1 ? "1 visita en total" : `${item.totalVisits} visitas en total`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Progress item={item} />
              {item.availableRewards > 0 ? (
                <p className="rounded-xl border-2 border-brand-ink p-3 text-sm font-semibold">
                  {item.availableRewards === 1
                    ? "Tienes 1 premio pendiente. Pídelo en tu próxima visita."
                    : `Tienes ${item.availableRewards} premios pendientes. Pídelos en tus próximas visitas.`}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
