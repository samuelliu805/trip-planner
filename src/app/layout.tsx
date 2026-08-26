import type { Metadata } from "next";
import { Mali, Nunito } from "next/font/google";

import { QueryProvider } from "@/components/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/features/i18n/i18n-provider";
import { getRequestLocale, getRequestLocaleState } from "@/features/i18n/server";
import { getSiteUrl } from "@/features/sharing/site-url";

import "./globals.css";

const journalSans = Nunito({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-journal-sans",
});

const journalHand = Mali({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-journal-hand",
  weight: ["400", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const siteName = locale === "zh-CN" ? "行程规划" : "Trip Planner";
  return {
    metadataBase: new URL(getSiteUrl()),
    title: { default: siteName, template: `%s | ${siteName}` },
    description:
      locale === "zh-CN"
        ? "一个清晰高效的复杂行程规划空间。"
        : "A modern workspace for planning complex trips.",
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const localeState = await getRequestLocaleState();
  const { locale } = localeState;
  return (
    <html lang={locale}>
      <body className={`${journalSans.variable} ${journalHand.variable}`}>
        <I18nProvider
          initialLocale={locale}
          persistInitialLocale={localeState.source === "profile"}
        >
          <QueryProvider>
            <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
          </QueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
