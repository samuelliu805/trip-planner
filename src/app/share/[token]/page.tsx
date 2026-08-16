import type { Metadata } from "next";
import { cache } from "react";
import { z } from "zod";

import { PublicItineraryShell } from "@/features/sharing/components/public-itinerary-shell";
import { PublicUnavailable } from "@/features/sharing/components/public-unavailable";
import {
  getOwnerShareImageState,
  getOwnerSharePageByToken,
  getPublicItinerary,
  getPublicShareImage,
} from "@/features/sharing/data";
import { publicShareUrlState } from "@/features/sharing/public-url-state";
import { getRequestSiteUrl } from "@/features/sharing/request-site-url";
import { resolvePublicTemplate } from "@/features/sharing/templates/resolver";
import { publicTemplateRuntimeConfig } from "@/features/sharing/templates/runtime/config.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const tokenSchema = z.uuid();
const loadItinerary = cache(async (token: string) =>
  tokenSchema.safeParse(token).success ? getPublicItinerary(token) : null,
);
const loadShareImage = cache(async (token: string) =>
  tokenSchema.safeParse(token).success ? getPublicShareImage(token) : null,
);
const loadOwnerPage = cache(async (token: string) =>
  tokenSchema.safeParse(token).success ? getOwnerSharePageByToken(token) : null,
);

type PublicSharePageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PublicSharePageProps): Promise<Metadata> {
  const { token } = await params;
  const itinerary = await loadItinerary(token);
  if (!itinerary) {
    return {
      description: "The owner may have disabled or replaced this link.",
      robots: { follow: false, index: false, noarchive: true },
      title: "This itinerary is no longer available",
    };
  }
  return {
    description: itinerary.metadata.description,
    openGraph: {
      description: itinerary.metadata.description,
      title: itinerary.metadata.title,
      type: "website",
    },
    other: { referrer: "strict-origin" },
    robots: { follow: false, index: false, noarchive: true },
    title: itinerary.metadata.title,
    twitter: {
      card: "summary_large_image",
      description: itinerary.metadata.description,
      title: itinerary.metadata.title,
    },
  };
}

export default async function PublicSharePage({ params, searchParams }: PublicSharePageProps) {
  const [{ token }, search] = await Promise.all([params, searchParams]);
  const [itinerary, shareImage, ownerPage, siteUrl] = await Promise.all([
    loadItinerary(token),
    loadShareImage(token),
    loadOwnerPage(token),
    getRequestSiteUrl(),
  ]);
  if (!itinerary) return <PublicUnavailable />;
  const ownerImageState = ownerPage ? await getOwnerShareImageState(ownerPage.id) : null;
  const urlState = publicShareUrlState(search, itinerary.settings.defaultView);
  const resolvedTemplate = resolvePublicTemplate({
    ...publicTemplateRuntimeConfig(),
    legacyTemplate: urlState.legacyTemplate,
    persistedTemplateId: itinerary.settings.templateId,
    persistedTemplateVersion: itinerary.settings.templateVersion,
  });
  if (resolvedTemplate.diagnostics.some(({ code }) => code !== "USED_FALLBACK"))
    console.warn("public_template_resolution", {
      diagnostics: resolvedTemplate.diagnostics,
      persistedTemplateId: itinerary.settings.templateId,
      persistedTemplateVersion: itinerary.settings.templateVersion,
    });
  return (
    <PublicItineraryShell
      initialView={urlState.view}
      itinerary={itinerary}
      key={`${resolvedTemplate.key}:${urlState.view}`}
      legacyTemplateOverride={urlState.legacyTemplate}
      ownerImageState={ownerImageState}
      ownerSharePage={ownerPage}
      publicUrl={`${siteUrl}/share/${token}`}
      shareImage={shareImage}
      templateKey={resolvedTemplate.key}
      token={token}
    />
  );
}
