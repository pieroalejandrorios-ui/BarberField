import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Crear cuenta · Barber Field" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Crear cuenta</h1>
      <AuthForm mode="signup" />
    </>
  );
}
