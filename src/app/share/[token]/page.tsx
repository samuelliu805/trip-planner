import type { Metadata } from "next";
import { cache } from "react";
import { z } from "zod";

import { PublicItineraryShell } from "@/features/sharing/components/public-itinerary-shell";
import { PublicUnavailable } from "@/features/sharing/components/public-unavailable";
import { getPublicItinerary } from "@/features/sharing/data";
import { publicShareUrlState } from "@/features/sharing/public-url-state";
import { getSiteUrl } from "@/features/sharing/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const tokenSchema = z.uuid();
const loadItinerary = cache(async (token: string) =>
  tokenSchema.safeParse(token).success ? getPublicItinerary(token) : null,
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
  const itinerary = await loadItinerary(token);
  if (!itinerary) return <PublicUnavailable />;
  const urlState = publicShareUrlState(search, itinerary.settings.defaultView);
  return (
    <PublicItineraryShell
      initialTemplate={urlState.template}
      initialView={urlState.view}
      itinerary={itinerary}
      key={`${urlState.template}:${urlState.view}`}
      publicUrl={`${getSiteUrl()}/share/${token}`}
      token={token}
    />
  );
}
