import type { Metadata } from "next";
import Link from "next/link";

import { LanguageSwitcher } from "@/features/i18n/language-switcher";
import { tripPlannerBrandName } from "@/features/landing/brand";

export const metadata: Metadata = {
  robots: { follow: false, index: false, noarchive: true },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh overflow-hidden bg-background">
      <header className="fixed inset-x-0 top-0 z-[80] h-[calc(72px+env(safe-area-inset-top,0px))] border-b border-white/10 bg-[var(--brand-navy)] text-[var(--brand-paper)] shadow-[0_8px_30px_rgba(9,18,31,0.12)]">
        <div className="mx-auto flex h-full max-w-[1920px] items-center justify-between px-5 pt-[env(safe-area-inset-top,0px)] sm:px-8 lg:px-[4.8rem]">
          <Link
            className="inline-flex min-h-11 items-center text-[1.35rem] font-extrabold tracking-[-0.04em]"
            href="/"
          >
            {tripPlannerBrandName}
          </Link>
          <LanguageSwitcher className="text-[var(--brand-paper)]" />
        </div>
      </header>
      <section className="relative flex min-h-dvh items-start justify-center overflow-hidden px-4 pb-8 pt-[calc(104px+env(safe-area-inset-top,0px))] sm:items-center sm:bg-muted sm:px-6 sm:pb-12 sm:pt-[calc(100px+env(safe-area-inset-top,0px))]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-background to-transparent" />
        <div className="relative w-full max-w-[420px]">{children}</div>
      </section>
    </main>
  );
}
