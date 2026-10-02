import Link from "next/link";
import { getMyBusinesses, requireAccount } from "@/lib/session";
import { BusinessSwitcher } from "./business-switcher";
import { AccountMenu } from "./account-menu";
import { Brand } from "@/components/brand";

export const metadata = { robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  // Exige los términos vigentes antes de mostrar cualquier pantalla del panel.
  const { email, account } = await requireAccount();
  const businesses = await getMyBusinesses();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-brand-line bg-white/70">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 sm:px-8">
          <Link href="/barberias" aria-label="Barber Field, inicio" className="font-semibold">
            <Brand />
          </Link>
          {businesses.length > 1 ? (
            <div className="order-last w-full sm:order-none sm:mr-auto sm:w-72">
              <BusinessSwitcher businesses={businesses} />
            </div>
          ) : null}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {account.isPro ? (
              <span className="rounded-full bg-brand-ink px-2.5 py-1 text-xs font-semibold text-white">Pro</span>
            ) : null}
            <span className="hidden truncate text-sm text-brand-muted sm:inline">
              {email}
            </span>
            <Link
              href="/panel/nuevo"
              className="inline-flex min-h-11 items-center rounded-xl border border-brand-line bg-white px-3 text-sm font-semibold hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand-ink"
            >
              <span aria-hidden="true" className="mr-1">+</span>Crear
            </Link>
            <AccountMenu email={email} />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="app-content mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 pt-8 pb-32 sm:px-8">
        {children}
      </main>
    </div>
  );
}
