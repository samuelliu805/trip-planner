import { T } from "@/features/i18n/i18n-provider";
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
    <div className="min-w-0 space-y-1.5 sm:col-span-2">
      <Label htmlFor="long-image-qr-destination">
        <T message={"QR code opens"} />
      </Label>
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
          <SelectItem value="current_share_page">
            <T message={"This shareable page"} />
          </SelectItem>
          <SelectItem value="homepage">
            <T message={"Trip Planner home — no itinerary shared"} />
          </SelectItem>
          {sharePages.map((page) => (
            <SelectItem key={page.id} value={`share_page:${page.id}`}>
              <T message={" Another shareable page — "} />
              {page.shareTitle || page.templateId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
