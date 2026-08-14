import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PlannerVariant } from "@/features/itinerary/types";

import { canonicalPublicViews } from "../schema";
import { publicViewLabels, type ShareSettings } from "./public-share-settings";

function SettingsToggle({
  checked,
  description,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="flex min-h-11 min-w-0 cursor-pointer items-start gap-3 border-b py-2.5 last:border-b-0"
      htmlFor={id}
    >
      <Checkbox
        checked={checked}
        className="mt-0.5 size-5"
        id={id}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export function PublicShareSettingsFields({
  activeCount,
  onChooseVariant,
  onSettingChange,
  settings,
  suggestedDescription,
  suggestedTitle,
  variantId,
  variants,
}: {
  activeCount: number;
  onChooseVariant: (variantId: string) => void;
  onSettingChange: <Key extends keyof ShareSettings>(key: Key, value: ShareSettings[Key]) => void;
  settings: ShareSettings;
  suggestedDescription: string;
  suggestedTitle: string;
  variantId: string;
  variants: PlannerVariant[];
}) {
  return (
    <div className="min-w-0 space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="public-share-variant">Route variant</Label>
        <Select onValueChange={onChooseVariant} value={variantId}>
          <SelectTrigger id="public-share-variant">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {variants.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Changing your Primary route later does not retarget this link.{" "}
          {activeCount ? `${activeCount} active ${activeCount === 1 ? "link" : "links"}.` : ""}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Initial public view</legend>
        <div className="grid grid-cols-3 border">
          {canonicalPublicViews.map((view) => (
            <button
              aria-pressed={settings.defaultView === view}
              className="min-h-11 border-r px-2 text-sm font-medium last:border-r-0 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              key={view}
              onClick={() => onSettingChange("defaultView", view)}
              type="button"
            >
              {publicViewLabels[view]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="border px-3">
        <SettingsToggle
          checked={settings.showTimes}
          description="Show only times you entered; no time is invented."
          id="share-show-times"
          label="Times"
          onCheckedChange={(value) => onSettingChange("showTimes", value)}
        />
        <SettingsToggle
          checked={settings.showMapRoutes}
          description="Show shared places, maps and safe saved-route details."
          id="share-show-routes"
          label="Map and saved routes"
          onCheckedChange={(value) => onSettingChange("showMapRoutes", value)}
        />
        <SettingsToggle
          checked={settings.allowRouteExplore}
          description="Visitors may calculate a temporary route from shared stops only."
          id="share-allow-explore"
          label="Allow viewers to explore routes"
          onCheckedChange={(value) => onSettingChange("allowRouteExplore", value)}
        />
        <SettingsToggle
          checked={settings.showAddresses}
          description="Off keeps exact address text out of the public payload."
          id="share-show-addresses"
          label="Exact addresses"
          onCheckedChange={(value) => onSettingChange("showAddresses", value)}
        />
        <SettingsToggle
          checked={settings.showNotes}
          description="Off removes item, day and note entries from the public payload."
          id="share-show-notes"
          label="Notes"
          onCheckedChange={(value) => onSettingChange("showNotes", value)}
        />
        <SettingsToggle
          checked={settings.showPlacePhotos}
          description="Use optional Google Place imagery when a shared place has a photo."
          id="share-show-place-photos"
          label="Google Place photos"
          onCheckedChange={(value) => onSettingChange("showPlacePhotos", value)}
        />
        <SettingsToggle
          checked={settings.showQuickActionLinks}
          description="Share only valid HTTP(S) actions saved on itinerary items."
          id="share-show-links"
          label="Quick action links"
          onCheckedChange={(value) => onSettingChange("showQuickActionLinks", value)}
        />
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="share-title">Public title</Label>
          <Input
            id="share-title"
            maxLength={160}
            onChange={(event) => onSettingChange("shareTitle", event.target.value)}
            placeholder={suggestedTitle}
            value={settings.shareTitle}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="share-description">Public description</Label>
          <Textarea
            id="share-description"
            maxLength={500}
            onChange={(event) => onSettingChange("shareDescription", event.target.value)}
            placeholder={suggestedDescription}
            value={settings.shareDescription}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Public notes and links may contain booking references. Review what you choose to share.
        </p>
      </div>
    </div>
  );
}
