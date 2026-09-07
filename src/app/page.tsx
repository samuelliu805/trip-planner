import type { Metadata } from "next";

import { tripPlannerBrandName } from "@/features/landing/brand";
import { LandingPage } from "@/features/landing/landing-page";
import {
  getLandingStructuredData,
  landingDescriptionMessage,
  serializeStructuredData,
} from "@/features/landing/seo";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getSiteUrl } from "@/features/sharing/site-url";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const siteName = tripPlannerBrandName;
  const title = translateMessage(locale, "Trip Planner — Plan routes, stays and travel details");
  const description = translateMessage(locale, landingDescriptionMessage);
  return {
    alternates: { canonical: "/" },
    applicationName: siteName,
    category: "travel",
    description,
    icons: { icon: "/icon.svg" },
    openGraph: {
      description,
      images: [
        {
          alt: translateMessage(locale, "Trip Planner itinerary workspace"),
          height: 630,
          url: "/opengraph-image",
          width: 1200,
        },
      ],
      locale: locale === "zh-CN" ? "zh_CN" : "en_US",
      siteName,
      title,
      type: "website",
      url: "/",
    },
    robots: { follow: true, index: true },
    title: { absolute: title },
    twitter: {
      card: "summary_large_image",
      description,
      images: ["/opengraph-image"],
      title,
    },
  };
}

export default async function Home() {
  const locale = await getRequestLocale();
  const structuredData = getLandingStructuredData(locale, getSiteUrl());

  return (
    <>
      <script
        data-testid="landing-structured-data"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }}
        type="application/ld+json"
      />
      <LandingPage year={new Date().getFullYear()} />
    </>
  );
}
