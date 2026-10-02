import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { TERMS_VERSION } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Privacidad · Barber Field",
  description: "Cómo trata Barber Field los datos personales, conforme a la Ley N.º 29733.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidad" version={TERMS_VERSION}>
      <p>
        Esta política explica cómo se tratan los datos personales en Barber Field, conforme a la Ley N.º 29733, Ley de
        Protección de Datos Personales, y su reglamento (Decreto Supremo N.º 003-2013-JUS).
      </p>

      <h2>1. Responsables</h2>
      <ul>
        <li>Datos de tu cuenta (correo y aceptación de términos): responsable Barber Field. Datos de contacto: pendientes de definir.</li>
        <li>
          Datos de los clientes de cada barbería (nombre, DNI, celular, visitas y premios): responsable la barbería que
          los registró. Barber Field actúa como encargado del tratamiento.
        </li>
      </ul>

      <h2>2. Datos que tratamos y para qué</h2>
      <ul>
        <li>Cuenta: correo y contraseña cifrada, para identificarte y darte acceso.</li>
        <li>Barberías: nombre, dirección, servicios, horario, fotos y redes, para mostrar su página pública.</li>
        <li>
          Clientes de las barberías: nombre, DNI y celular, para identificar al cliente y llevar sus visitas y premios. Se
          registran solo con su autorización.
        </li>
        <li>Fecha y versión de los términos aceptados, como constancia del consentimiento.</li>
      </ul>

      <h2>3. Qué es público</h2>
      <p>
        Solo los datos de la página que cada barbería publica. El DNI, los celulares de clientes, los clientes y las
        visitas nunca son públicos.
      </p>

      <h2>4. Proveedores y transferencias</h2>
      <p>
        Usamos proveedores de infraestructura (base de datos, almacenamiento de archivos y alojamiento web) que pueden
        procesar datos fuera del Perú, con medidas de seguridad. No vendemos datos personales.
      </p>

      <h2>5. Conservación y seguridad</h2>
      <p>
        Conservamos los datos mientras la cuenta o la barbería estén activas, o el tiempo que exija la ley. Aplicamos
        control de acceso por barbería, cifrado en tránsito y registro de auditoría de los cambios importantes.
      </p>

      <h2>6. Tus derechos</h2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición. Si eres cliente de una barbería,
        dirígete primero a ella. Canal de contacto con Barber Field: pendiente de definir. También puedes acudir a la
        Autoridad Nacional de Protección de Datos Personales.
      </p>

      <h2>7. Cambios</h2>
      <p>Si cambiamos esta política, publicaremos la nueva versión y te pediremos aceptarla en tu siguiente ingreso.</p>
    </LegalPage>
  );
}
