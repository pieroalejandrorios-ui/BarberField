import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main-content" tabIndex={-1} className="app-content mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-5 py-12">
      <Link href="/" className="text-lg font-semibold">
        <Brand />
      </Link>
      <p className="max-w-sm text-xl font-medium leading-snug text-brand-leaf">Cada experiencia cuenta. Una razón más para volver</p>
      <div className="flex flex-col gap-6 rounded-2xl border border-brand-line bg-white p-6 shadow-[0_16px_45px_-30px_#172c2635] sm:p-8">{children}</div>
    </main>
  );
}
