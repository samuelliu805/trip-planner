import type { Metadata } from "next";
import { cache } from "react";
import { z } from "zod";

import { PublicItineraryShell } from "@/features/sharing/components/public-itinerary-shell";
import { PublicUnavailable } from "@/features/sharing/components/public-unavailable";
import { getPublicItinerary } from "@/features/sharing/data";
import { getSiteUrl } from "@/features/sharing/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const tokenSchema = z.uuid();
const loadItinerary = cache(async (token: string) =>
  tokenSchema.safeParse(token).success ? getPublicItinerary(token) : null,
);

type PublicSharePageProps = { params: Promise<{ token: string }> };

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

export default async function PublicSharePage({ params }: PublicSharePageProps) {
  const { token } = await params;
  const itinerary = await loadItinerary(token);
  if (!itinerary) return <PublicUnavailable />;
  return (
    <PublicItineraryShell
      itinerary={itinerary}
      publicUrl={`${getSiteUrl()}/share/${token}`}
      token={token}
    />
  );
}
