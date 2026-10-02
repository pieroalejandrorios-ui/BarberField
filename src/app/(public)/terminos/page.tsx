import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { OWNER_TERMS_VERSION, TERMS_VERSION } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Términos y condiciones · Barber Field",
  description: "Condiciones de uso de Barber Field para clientes y dueños de barberías.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Términos y condiciones" version={TERMS_VERSION}>
      <h2>1. Qué es Barber Field</h2>
      <p>
        Barber Field es una plataforma web para que las barberías registren a sus clientes, sus visitas y sus premios por
        fidelidad, y publiquen una página con sus servicios, horario y ubicación.
      </p>

      <h2>2. Cuentas</h2>
      <ul>
        <li>Para crear una cuenta necesitas un correo válido y una contraseña. Eres responsable de mantenerla en secreto.</li>
        <li>Toda cuenta nueva es una cuenta normal, que una barbería puede registrar como trabajador.</li>
        <li>
          Al crear una barbería, la cuenta pasa a ser Pro (dueño). Por ahora la cuenta Pro es gratuita; si en el futuro
          tiene costo, te avisaremos antes y podrás decidir si continúas.
        </li>
      </ul>

      <h2>3. Uso permitido</h2>
      <ul>
        <li>Usa la plataforma solo para gestionar tu barbería o consultar tu propia información.</li>
        <li>No registres datos falsos ni datos de personas que no lo autorizaron.</li>
        <li>No intentes acceder a información de otras barberías o personas.</li>
      </ul>

      <h2 id="duenos">4. Condiciones de dueño (cuenta Pro)</h2>
      <p>Versión {OWNER_TERMS_VERSION}. Al crear una barbería declaras y aceptas que:</p>
      <ul>
        <li>
          Eres responsable de los datos personales de tus clientes (nombre, DNI, celular y visitas) conforme a la Ley
          N.º 29733, Ley de Protección de Datos Personales, y su reglamento. Barber Field los trata por encargo tuyo.
        </li>
        <li>
          Solo registrarás clientes que te hayan autorizado y atenderás sus solicitudes de acceso, rectificación,
          cancelación y oposición.
        </li>
        <li>Respondes por lo que hagan los trabajadores que agregues y los desactivarás cuando dejen de trabajar contigo.</li>
        <li>El contenido de tu página pública (textos, fotos y precios) es tuyo, debe ser veraz y no infringir derechos de terceros.</li>
      </ul>

      <h2>5. Disponibilidad</h2>
      <p>Hacemos lo posible por mantener el servicio disponible, pero puede haber interrupciones por mantenimiento o causas ajenas.</p>

      <h2>6. Privacidad</h2>
      <p>
        El tratamiento de datos personales se explica en la{" "}
        <Link href="/privacidad" className="font-medium underline">
          Política de Privacidad
        </Link>
        .
      </p>

      <h2>7. Cambios</h2>
      <p>Si cambiamos estos términos, publicaremos la nueva versión y te pediremos aceptarla en tu siguiente ingreso.</p>
    </LegalPage>
  );
}
