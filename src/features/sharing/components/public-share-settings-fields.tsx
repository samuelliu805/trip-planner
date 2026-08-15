import type { PlannerVariant } from "@/features/itinerary/types";

import type { PublicItineraryLink } from "../types";
import { LongImageSettingsFields } from "./long-image-settings-fields";
import { PublicSharePageFields } from "./public-share-page-fields";
import type { ShareSettings } from "./public-share-settings";
import { PublicShareVisibilityFields } from "./public-share-visibility-fields";

export function PublicShareSettingsFields({
  dayCount,
  existingPage,
  onChooseVariant,
  onSettingChange,
  settings,
  sharePages,
  startDate,
  suggestedDescription,
  suggestedTitle,
  variantId,
  variants,
}: {
  dayCount: number;
  existingPage: boolean;
  onChooseVariant: (variantId: string) => void;
  onSettingChange: <Key extends keyof ShareSettings>(key: Key, value: ShareSettings[Key]) => void;
  settings: ShareSettings;
  sharePages: PublicItineraryLink[];
  startDate: string | null;
  suggestedDescription: string;
  suggestedTitle: string;
  variantId: string;
  variants: PlannerVariant[];
}) {
  return (
    <div className="min-w-0 space-y-4">
      <PublicSharePageFields
        existingPage={existingPage}
        onChooseVariant={onChooseVariant}
        onSettingChange={onSettingChange}
        settings={settings}
        suggestedDescription={suggestedDescription}
        suggestedTitle={suggestedTitle}
        variantId={variantId}
        variants={variants}
      />
      <PublicShareVisibilityFields onSettingChange={onSettingChange} settings={settings} />
      <LongImageSettingsFields
        dayCount={dayCount}
        onSettingChange={onSettingChange}
        settings={settings}
        sharePages={sharePages}
        startDate={startDate}
      />
    </div>
  );
}
