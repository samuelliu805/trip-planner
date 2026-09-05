"use client";

import { T } from "@/features/i18n/i18n-provider";
import type { PublicItinerary, PublicView, ShareImageManifest } from "../types";
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
  publicUrl,
  shareImage,
  templateKey,
  token,
}: {
  initialView: PublicView;
  itinerary: PublicItinerary;
  legacyTemplateOverride?: "bento" | "standard";
  publicUrl: string;
  shareImage: ShareImageManifest | null;
  templateKey: PublicTemplateKey;
  token: string;
}) {
  const template = getPublicTemplate(templateKey) ?? getPublicTemplate(LEGACY_PUBLIC_TEMPLATE_KEY);
  if (!template)
    return (
      <main className="grid min-h-dvh place-items-center bg-background p-6">
        <p role="alert">
          <T message={"This itinerary template is temporarily unavailable."} />
        </p>
      </main>
    );
  return (
    <PublicTemplateControllerProvider
      initialView={initialView}
      itinerary={itinerary}
      legacyTemplateOverride={legacyTemplateOverride}
      publicUrl={publicUrl}
      shareImage={shareImage}
      template={template}
      token={token}
    >
      <PublicTemplateRenderer template={template} />
    </PublicTemplateControllerProvider>
  );
}
