import Link from "next/link";
import { requireUser } from "@/lib/session";
import { signOut } from "./actions";
import { Brand } from "@/components/brand";

export const metadata = { robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  const { email } = await requireUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-brand-line bg-white/70">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/panel" className="font-semibold">
            <Brand />
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-brand-muted sm:inline">
              {email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="min-h-11 rounded-xl px-3 text-sm font-medium underline hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ink"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="app-content mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 pt-8 pb-32 sm:px-8">
        {children}
      </main>
    </div>
  );
}
