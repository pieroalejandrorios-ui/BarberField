import Link from "next/link";
import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { FixedCta } from "@/components/fixed-cta";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

export const metadata: Metadata = {
  title: "Barber Field · Cada experiencia cuenta",
  description: "Organiza clientes y visitas, elige tus premios por fidelidad y comparte la página de tu barbería.",
};

const primary = `${buttonClass} sm:w-auto`;
const secondary = `${secondaryButtonClass} sm:w-auto`;
const features = [
  { number: "01", title: "Tu cliente, con su historial", text: "Encuentra a cada cliente y consulta sus servicios, visitas y premios pendientes en una sola ficha." },
  { number: "02", title: "El premio lo decides tú", text: "Elige cuántas visitas cuentan y qué se gana: un servicio gratis, un descuento o un beneficio especial." },
  { number: "03", title: "Tu equipo, bien organizado", text: "Agrega trabajadores y registra quién atendió. Las correcciones y anulaciones conservan su historial." },
  { number: "04", title: "Una página para tu barbería", text: "Publica tus servicios, fotos, horario y ubicación. Comparte un enlace con tus clientes." },
];
const questions = [
  { question: "¿El quinto corte siempre tiene que ser gratis?", answer: "Tú eliges el premio y la cantidad de visitas. Puede ser un servicio gratis, un porcentaje de descuento, un monto fijo o un beneficio especial. Cinco visitas es solo el valor inicial." },
  { question: "¿El cliente puede usar el premio otro día?", answer: "Sí. Cuando gana un premio, tu equipo puede aplicarlo en esa visita o dejarlo pendiente para una visita posterior." },
  { question: "¿Puedo trabajar desde mi celular?", answer: "Sí. La aplicación se abre en el navegador del celular o de la computadora. Tu equipo entra con su propia cuenta." },
  { question: "¿Envía promociones o recordatorios automáticamente?", answer: "Esta versión registra clientes, visitas y premios. Todavía no envía mensajes ni recordatorios automáticos y no gestiona reservas." },
];

export default function Home() {
  return <div className="min-h-screen bg-brand-canvas pb-28 text-brand-ink">
    <header className="border-b border-brand-ink/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-8">
        <Link href="/" aria-label="Barber Field, inicio" className="flex min-h-11 items-center gap-3 font-semibold tracking-tight">
          <Brand />
        </Link>
        <Link href="/login" className="inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold lg:order-3">Iniciar sesión <span aria-hidden="true" className="ml-2">↗</span></Link>
        <nav aria-label="Navegación principal" className="w-full lg:w-auto">
          <ul className="flex flex-wrap gap-x-5 text-sm text-[#43574b]">
            <li><a href="#funciones" className="inline-flex min-h-11 items-center">Funciones</a></li>
            <li><a href="#como-funciona" className="inline-flex min-h-11 items-center">Cómo funciona</a></li>
            <li><a href="#preguntas" className="inline-flex min-h-11 items-center">Preguntas</a></li>
          </ul>
        </nav>
      </div>
    </header>

    <main id="main-content" tabIndex={-1}>
      <section aria-labelledby="hero-heading" className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] uppercase"><span aria-hidden="true" className="size-2 rounded-full bg-[#52754c]" />Hecho para el día a día de tu barbería</p>
          <h1 id="hero-heading" className="max-w-2xl text-5xl leading-[1.08] font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl">Cada experiencia cuenta.<br /><span className="text-brand-leaf">Una razón más para volver</span></h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-brand-muted">Registra a tus clientes, lleva sus visitas y prémialos a tu manera. Todo en un mismo lugar, desde tu celular.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/registro" className={primary}>Crear mi cuenta <span aria-hidden="true" className="ml-4">↗</span></Link><a href="#como-funciona" className={secondary}>Ver cómo funciona</a></div>
          <p className="mt-4 text-sm text-brand-muted">Tú decides cada cuántas visitas y qué premio ofrecer.</p>
        </div>

        <div className="rounded-[2rem] bg-brand-soft p-5 sm:p-8">
          <div className="flex items-center justify-between gap-4 pb-5 text-xs font-semibold tracking-wide uppercase"><span>Así se ve la fidelidad</span><span className="rounded-full border border-[#6b8056]/30 px-3 py-1">Ejemplo ilustrativo</span></div>
          <div className="overflow-hidden rounded-2xl border border-[#d0d9c4] bg-white shadow-[0_16px_45px_-20px_#172c2635]">
            <div className="flex items-center justify-between border-b border-[#ecede7] px-6 py-5"><span className="text-sm font-semibold">Ficha del cliente</span><span aria-hidden="true" className="text-lg">↗</span></div>
            <div className="p-6">
              <div className="flex items-center gap-3"><div aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-[#eff1e8] font-semibold">C</div><div><p className="font-semibold">Cliente de ejemplo</p><p className="text-xs text-[#5a685c]">Su próxima visita tiene premio</p></div></div>
              <div className="mt-7 flex items-baseline justify-between gap-4"><p className="text-sm font-medium">Visitas registradas</p><p className="text-2xl font-semibold">4 <span className="text-base font-normal text-[#5a685c]">de 5</span></p></div>
              <ol aria-label="Ejemplo: cuatro visitas completadas de cinco" className="mt-4 grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map(n => <li key={n} aria-label={`Visita ${n}: ${n === 5 ? "pendiente" : "completada"}`} className={`flex aspect-square items-center justify-center rounded-xl text-lg ${n === 5 ? "border border-dashed border-[#879774] text-[#60744a]" : "bg-brand-ink text-brand-accent"}`}><span aria-hidden="true">{n === 5 ? "☆" : "✓"}</span></li>)}</ol>
              <div className="mt-6 rounded-xl bg-[#f0f4e3] p-4"><p className="text-sm font-semibold">La próxima visita gana un premio</p><p className="mt-1 text-xs leading-relaxed text-brand-muted">El servicio, descuento o beneficio que tú hayas elegido.</p></div>
            </div>
          </div>
          <p className="mt-5 text-center text-xs text-brand-muted">Un historial claro. Un premio elegido por ti.</p>
        </div>
      </section>

      <section id="funciones" aria-labelledby="features-heading" className="scroll-mt-6 border-y border-brand-ink/10 bg-white/60">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.16em] uppercase text-brand-leaf">Menos apuntes, más claridad</p>
          <h2 id="features-heading" className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Tu barbería organizada,<br />de la primera visita al premio.</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">{features.map(f => <article key={f.number} className="border-t border-brand-line pt-5"><span className="text-xs font-semibold text-brand-leaf">{f.number}</span><h3 className="mt-4 text-lg font-semibold">{f.title}</h3><p className="mt-3 text-sm leading-relaxed text-brand-muted">{f.text}</p></article>)}</div>
        </div>
      </section>

      <section id="como-funciona" aria-labelledby="steps-heading" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-16 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-2"><div><p className="text-xs font-semibold tracking-[0.16em] uppercase text-brand-leaf">Empieza a tu ritmo</p><h2 id="steps-heading" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Del registro a la<br />próxima visita.</h2><p className="mt-4 max-w-md leading-relaxed text-brand-muted">Define tus reglas una vez. Tu equipo registra las visitas y el sistema lleva el progreso.</p></div>
          <ol className="flex flex-col divide-y divide-brand-line">{[
            ["Crea tu barbería", "Registra tu cuenta, agrega tus servicios y configura tu premio por fidelidad."],
            ["Registra cada visita", "Busca o crea al cliente, elige los servicios y registra quién lo atendió."],
            ["Aplica el premio", "Al llegar a la meta, aplícalo en esa visita o déjalo pendiente para la próxima."],
          ].map(([title, text], index) => <li key={title} className="flex gap-4 py-5 first:pt-0"><span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#a9b49d] text-sm">{index + 1}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-brand-muted">{text}</p></div></li>)}</ol>
        </div>
      </section>

      <section id="preguntas" aria-labelledby="faq-heading" className="mx-auto max-w-6xl scroll-mt-6 px-5 pb-16 sm:px-8">
        <div className="rounded-2xl border border-brand-line bg-white/60 p-6 sm:p-10"><h2 id="faq-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">Antes de empezar</h2><div className="mt-6 divide-y divide-[#dce1d3]">{questions.map(q => <details key={q.question} className="group py-4"><summary className="min-h-11 cursor-pointer content-center pr-4 font-medium">{q.question}</summary><p className="max-w-3xl pt-2 text-sm leading-relaxed text-brand-muted">{q.answer}</p></details>)}</div></div>
      </section>

      <section aria-labelledby="start-heading" className="bg-brand-ink px-5 py-14 text-brand-canvas sm:px-8"><div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center"><div><h2 id="start-heading" className="text-3xl font-semibold tracking-tight">Que la próxima visita también cuente.</h2><p className="mt-3 text-[#d1dbbf]">Empieza por tu barbería. El premio lo pones tú.</p></div><Link href="/registro" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-brand-accent px-6 py-3 text-sm font-semibold text-brand-ink hover:bg-[#eff6d6]">Crear cuenta <span aria-hidden="true" className="ml-4">↗</span></Link></div></section>
    </main>
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm sm:px-8"><p className="font-semibold">Barber Field</p><p className="text-brand-muted">Clientes, visitas y premios. A tu manera.</p><Link href="/login" className="inline-flex min-h-11 items-center underline underline-offset-4">Iniciar sesión</Link></footer>
    <FixedCta href="/registro" label="Crear mi cuenta" note="Cada experiencia cuenta. Una razón más para volver" />
  </div>;
}
