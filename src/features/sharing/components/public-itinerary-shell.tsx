"use client";

import type {
  OwnerShareImageState,
  PublicItinerary,
  PublicItineraryLink,
  PublicView,
  ShareImageManifest,
} from "../types";
import {
  LEGACY_PUBLIC_TEMPLATE_KEY,
  getPublicTemplate,
  type PublicTemplateKey,
} from "../templates/registry";
import { PublicTemplateControllerProvider } from "../templates/runtime/controller";
import { PublicTemplateRenderer } from "../templates/runtime/renderer";

export function PublicItineraryShell({
  initialView,
  itinerary,
  legacyTemplateOverride,
  ownerImageState,
  ownerSharePage,
  publicUrl,
  shareImage,
  templateKey,
  token,
}: {
  initialView: PublicView;
  itinerary: PublicItinerary;
  legacyTemplateOverride?: "bento" | "standard";
  ownerImageState: OwnerShareImageState | null;
  ownerSharePage: PublicItineraryLink | null;
  publicUrl: string;
  shareImage: ShareImageManifest | null;
  templateKey: PublicTemplateKey;
  token: string;
}) {
  const template = getPublicTemplate(templateKey) ?? getPublicTemplate(LEGACY_PUBLIC_TEMPLATE_KEY);
  if (!template)
    return (
      <main className="grid min-h-dvh place-items-center bg-background p-6">
        <p role="alert">This itinerary template is temporarily unavailable.</p>
      </main>
    );
  return (
    <PublicTemplateControllerProvider
      initialView={initialView}
      itinerary={itinerary}
      legacyTemplateOverride={legacyTemplateOverride}
      ownerImageState={ownerImageState}
      ownerSharePage={ownerSharePage}
      publicUrl={publicUrl}
      shareImage={shareImage}
      template={template}
      token={token}
    >
      <PublicTemplateRenderer template={template} />
    </PublicTemplateControllerProvider>
  );
}
