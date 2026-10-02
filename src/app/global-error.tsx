"use client";

import Link from "next/link";

// Sustituye al layout raíz: estilos propios, idioma y documento completos.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="es"><body style={{ margin: 0, background: "#f7f7ee", color: "#172c26", fontFamily: "Arial, sans-serif" }}>
    <main style={{ maxWidth: 440, margin: "15vh auto", padding: 24 }}>
      <h1>No se pudo abrir la aplicación</h1>
      <p role="alert">Vuelve a intentarlo en unos momentos.</p>
      <button onClick={retry} style={{ minHeight: 48, padding: "12px 20px", cursor: "pointer", border: 0, borderRadius: 12, background: "#172c26", color: "white", fontWeight: 600 }}>Reintentar</button>
      <p><Link href="/">Volver al inicio</Link></p>
    </main>
  </body></html>;
}
