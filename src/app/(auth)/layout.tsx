import { LanguageSwitcher } from "@/features/i18n/language-switcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-start justify-center overflow-hidden bg-background px-4 py-8 sm:items-center sm:bg-muted sm:px-6 sm:py-12">
      <LanguageSwitcher className="absolute right-3 top-3 z-[70] sm:right-5 sm:top-5" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-background to-transparent" />
      <div className="relative w-full max-w-[420px]">{children}</div>
    </main>
  );
}
