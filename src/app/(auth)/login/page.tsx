import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Iniciar sesión · Barber Field" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
      <AuthForm mode="login" />
    </>
  );
}
