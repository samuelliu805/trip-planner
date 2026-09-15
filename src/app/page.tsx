import type { Metadata } from "next";

import { LandingPage } from "@/features/landing/landing-page";
import {
  getLandingStructuredData,
  serializeStructuredData,
  tripPlannerSeoForRegion,
} from "@/features/landing/seo";
import { getRequestLocale } from "@/features/i18n/server";
import { AuthenticatedGuestStorageCleanup } from "@/features/guest/components/authenticated-guest-storage-cleanup";
import { getSiteUrl } from "@/features/sharing/site-url";
import { getAuthProvider } from "@/platform/composition/server";
import { getServerProviderConfig } from "@/platform/config/server";
import { appUserIdentityLabel } from "@/platform/contracts/auth";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const appRegion = getServerProviderConfig().appRegion;
  const seo = tripPlannerSeoForRegion(appRegion);
  return {
    alternates: { canonical: "/" },
    applicationName: seo.name,
    category: "travel",
    description: seo.description,
    icons: { icon: "/icon.svg" },
    keywords: seo.keywords,
    openGraph: {
      description: seo.description,
      images: [
        {
          alt: seo.shareImageAlt,
          height: 630,
          url: "/opengraph-image",
          width: 1200,
        },
      ],
      locale: locale === "zh-CN" ? "zh_CN" : "en_US",
      siteName: seo.name,
      title: seo.title,
      type: "website",
      url: "/",
    },
    robots: { follow: true, index: true },
    title: { absolute: seo.title },
    twitter: {
      card: "summary_large_image",
      description: seo.description,
      images: ["/opengraph-image"],
      title: seo.title,
    },
  };
}

export default async function Home() {
  const appRegion = getServerProviderConfig().appRegion;
  const [locale, user] = await Promise.all([
    getRequestLocale(),
    getAuthProvider().getCurrentUser(),
  ]);
  const structuredData = getLandingStructuredData(locale, getSiteUrl(), appRegion);
  const accountLabel = user ? appUserIdentityLabel(user) : undefined;

  return (
    <>
      <script
        data-testid="landing-structured-data"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }}
        type="application/ld+json"
      />
      {user ? <AuthenticatedGuestStorageCleanup /> : null}
      <LandingPage
        accountLabel={accountLabel}
        appRegion={appRegion}
        year={new Date().getFullYear()}
      />
    </>
  );
}
