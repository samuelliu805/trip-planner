import type { Metadata } from "next";
import { after } from "next/server";
import { cache } from "react";
import { z } from "zod";

import { PublicItineraryShell } from "@/features/sharing/components/public-itinerary-shell";
import { PublicUnavailable } from "@/features/sharing/components/public-unavailable";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getPublicItinerary, getPublicShareImage } from "@/features/sharing/data";
import { localizeGeneratedPublicDescription } from "@/features/sharing/public-copy";
import { publicShareUrlState } from "@/features/sharing/public-url-state";
import { getRequestSiteUrl } from "@/features/sharing/request-site-url";
import { publicTemplateResolutionWarningFields } from "@/features/sharing/templates/resolution-telemetry";
import { resolvePublicTemplate } from "@/features/sharing/templates/resolver";
import { publicTemplateRuntimeConfig } from "@/features/sharing/templates/runtime/config.server";
import { logger } from "@/lib/telemetry/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const tokenSchema = z.uuid();
const loadItinerary = cache(async (token: string) =>
  tokenSchema.safeParse(token).success ? getPublicItinerary(token) : null,
);
const loadShareImage = cache(async (token: string) =>
  tokenSchema.safeParse(token).success ? getPublicShareImage(token) : null,
);
type PublicSharePageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PublicSharePageProps): Promise<Metadata> {
  const [{ token }, locale, siteUrl] = await Promise.all([
    params,
    getRequestLocale(),
    getRequestSiteUrl(),
  ]);
  const itinerary = await loadItinerary(token);
  if (!itinerary) {
    return {
      description: translateMessage(locale, "The owner may have disabled or replaced this link."),
      robots: { follow: false, index: false, noarchive: true },
      title: translateMessage(locale, "This itinerary is no longer available"),
    };
  }
  const description = localizeGeneratedPublicDescription(itinerary.metadata.description, locale);
  const canonicalUrl = `${siteUrl}/share/${token}`;
  const imageUrl = `${canonicalUrl}/opengraph-image`;
  return {
    alternates: { canonical: canonicalUrl },
    description,
    icons: { icon: "/icon.svg" },
    openGraph: {
      description,
      images: [{ alt: itinerary.metadata.title, height: 630, url: imageUrl, width: 1200 }],
      locale: locale === "zh-CN" ? "zh_CN" : "en_US",
      siteName: locale === "zh-CN" ? "行程规划" : "Trip Planner",
      title: itinerary.metadata.title,
      type: "website",
      url: canonicalUrl,
    },
    other: { referrer: "strict-origin" },
    robots: { follow: false, index: false, noarchive: true },
    title: itinerary.metadata.title,
    twitter: {
      card: "summary_large_image",
      description,
      images: [imageUrl],
      title: itinerary.metadata.title,
    },
  };
}

export default async function PublicSharePage({ params, searchParams }: PublicSharePageProps) {
  const [{ token }, search] = await Promise.all([params, searchParams]);
  const [itinerary, shareImage, siteUrl] = await Promise.all([
    loadItinerary(token),
    loadShareImage(token),
    getRequestSiteUrl(),
  ]);
  if (!itinerary) return <PublicUnavailable />;
  const urlState = publicShareUrlState(search, itinerary.settings.defaultView);
  const resolvedTemplate = resolvePublicTemplate({
    ...publicTemplateRuntimeConfig(),
    legacyTemplate: urlState.legacyTemplate,
    persistedTemplateId: itinerary.settings.templateId,
    persistedTemplateVersion: itinerary.settings.templateVersion,
  });
  const templateWarning = publicTemplateResolutionWarningFields(resolvedTemplate);
  if (templateWarning) {
    logger.warn(templateWarning);
    after(() => logger.flush());
  }
  return (
    <PublicItineraryShell
      initialView={urlState.view}
      itinerary={itinerary}
      key={`${resolvedTemplate.key}:${urlState.view}`}
      legacyTemplateOverride={urlState.legacyTemplate}
      publicUrl={`${siteUrl}/share/${token}`}
      shareImage={shareImage}
      templateKey={resolvedTemplate.key}
      token={token}
    />
  );
}
