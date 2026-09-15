import type { Metadata } from "next";
import { Mali, Nunito } from "next/font/google";

import { QueryProvider } from "@/components/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/features/i18n/i18n-provider";
import { getRequestLocaleState } from "@/features/i18n/server";
import {
  tripPlannerBrandNameForRegion,
  tripPlannerSiteTitleForRegion,
} from "@/features/landing/brand";
import { tripPlannerSeoForRegion } from "@/features/landing/seo";
import { getSiteUrl } from "@/features/sharing/site-url";
import { TelemetryNavigation } from "@/lib/telemetry/navigation";
import { getServerProviderConfig } from "@/platform/config/server";

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
  const appRegion = getServerProviderConfig().appRegion;
  const siteName = tripPlannerBrandNameForRegion(appRegion);
  const seo = tripPlannerSeoForRegion(appRegion);
  return {
    applicationName: siteName,
    category: "travel",
    creator: siteName,
    description: seo.description,
    formatDetection: { address: false, email: false, telephone: false },
    icons: { icon: "/icon.svg" },
    keywords: seo.keywords,
    manifest: "/manifest.webmanifest",
    metadataBase: new URL(getSiteUrl()),
    publisher: siteName,
    referrer: "strict-origin",
    title: {
      default: tripPlannerSiteTitleForRegion(appRegion),
      template: `%s | ${siteName}`,
    },
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
            <TelemetryNavigation />
            <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
          </QueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
