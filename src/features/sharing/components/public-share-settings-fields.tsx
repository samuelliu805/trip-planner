import type { ReactNode } from "react";

import { T } from "@/features/i18n/i18n-provider";
import type { PlannerVariant } from "@/features/itinerary/types";

import type { PublicItineraryLink } from "../types";
import { PublicShareBasicFields } from "./public-share-basic-fields";
import { PublicSharePageFields } from "./public-share-page-fields";
import type { ShareSettings } from "./public-share-settings";
import { ShareSettingDisclosure, ShareSettingSection } from "./public-share-setting-card";
import { PublicShareVisibilityFields } from "./public-share-visibility-fields";

export function PublicShareSettingsFields({
  existingPage,
  onChooseVariant,
  onSettingChange,
  pagePicker,
  settings,
  sharePages,
  suggestedDescription,
  suggestedTitle,
  variantId,
  variants,
}: {
  existingPage: boolean;
  onChooseVariant: (variantId: string) => void;
  onSettingChange: <Key extends keyof ShareSettings>(key: Key, value: ShareSettings[Key]) => void;
  pagePicker: ReactNode;
  settings: ShareSettings;
  sharePages: PublicItineraryLink[];
  suggestedDescription: string;
  suggestedTitle: string;
  variantId: string;
  variants: PlannerVariant[];
}) {
  return (
    <div className="min-w-0 space-y-4">
      <PublicShareBasicFields
        existingPage={existingPage}
        onChooseVariant={onChooseVariant}
        onSettingChange={onSettingChange}
        settings={settings}
        variantId={variantId}
        variants={variants}
      />
      <ShareSettingDisclosure title="Advanced settings">
        <ShareSettingSection title="Shareable pages">
          <p className="text-xs leading-5 text-muted-foreground">
            <T message="Create multiple links with different routes, styles, and page settings." />
          </p>
          {pagePicker}
        </ShareSettingSection>
        <PublicSharePageFields
          onSettingChange={onSettingChange}
          settings={settings}
          suggestedDescription={suggestedDescription}
          suggestedTitle={suggestedTitle}
        />
        <PublicShareVisibilityFields
          onSettingChange={onSettingChange}
          settings={settings}
          sharePages={sharePages}
        />
      </ShareSettingDisclosure>
    </div>
  );
}
