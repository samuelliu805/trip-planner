import { Localized, T } from "@/features/i18n/i18n-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { canonicalPublicViews } from "../schema";
import { publicViewLabels, type ShareSettings } from "./public-share-settings";
import { ShareSettingSection } from "./public-share-setting-card";

export function PublicSharePageFields({
  onSettingChange,
  settings,
  suggestedDescription,
  suggestedTitle,
}: {
  onSettingChange: <Key extends keyof ShareSettings>(key: Key, value: ShareSettings[Key]) => void;
  settings: ShareSettings;
  suggestedDescription: string;
  suggestedTitle: string;
}) {
  return (
    <ShareSettingSection title="Landing view and text">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          <T message={"Opens on"} />
        </legend>
        <div className="grid grid-cols-3 border">
          {canonicalPublicViews.map((view) => (
            <button
              aria-pressed={settings.defaultView === view}
              className="min-h-11 border-r px-2 text-sm font-medium last:border-r-0 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              key={view}
              onClick={() => onSettingChange("defaultView", view)}
              type="button"
            >
              <Localized value={publicViewLabels[view]} />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="share-title">
            <T message={"Title"} />
          </Label>
          <Input
            id="share-title"
            maxLength={160}
            onChange={(event) => onSettingChange("shareTitle", event.target.value)}
            placeholder={suggestedTitle}
            value={settings.shareTitle}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="share-description">
            <T message={"Description"} />
          </Label>
          <Textarea
            id="share-description"
            maxLength={500}
            onChange={(event) => onSettingChange("shareDescription", event.target.value)}
            placeholder={suggestedDescription}
            value={settings.shareDescription}
          />
        </div>
      </div>
    </ShareSettingSection>
  );
}
