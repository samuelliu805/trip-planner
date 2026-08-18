import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { PublicItineraryLink } from "../types";
import type { ShareSettings } from "./public-share-settings";
import { ShareSettingSection } from "./public-share-setting-card";

export function LongImageSettingsFields({
  onSettingChange,
  settings,
  sharePages,
}: {
  onSettingChange: <Key extends keyof ShareSettings>(key: Key, value: ShareSettings[Key]) => void;
  settings: ShareSettings;
  sharePages: PublicItineraryLink[];
}) {
  return (
    <ShareSettingSection
      description="Choose where the QR code on generated trip images opens."
      title="Image QR code"
    >
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="long-image-qr-destination">QR code opens</Label>
        <Select
          onValueChange={(value) => {
            if (value === "homepage" || value === "current_share_page") {
              onSettingChange("longImageQrDestination", value);
              onSettingChange("longImageQrSharePageId", null);
              return;
            }
            onSettingChange("longImageQrDestination", "share_page");
            onSettingChange("longImageQrSharePageId", value.replace("share_page:", ""));
          }}
          value={
            settings.longImageQrDestination === "share_page"
              ? `share_page:${settings.longImageQrSharePageId}`
              : settings.longImageQrDestination
          }
        >
          <SelectTrigger className="min-h-11 min-w-0" id="long-image-qr-destination">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current_share_page">This shareable page</SelectItem>
            <SelectItem value="homepage">Trip Planner home — no itinerary shared</SelectItem>
            {sharePages.map((page) => (
              <SelectItem key={page.id} value={`share_page:${page.id}`}>
                Another shareable page — {page.shareTitle || page.templateId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Each permanent image keeps the QR destination used when it was first generated.
        </p>
      </div>
    </ShareSettingSection>
  );
}
