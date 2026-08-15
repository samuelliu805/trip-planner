import { addDays, format, parseISO } from "date-fns";

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
import { ShareSettingSection, ShareSettingToggle } from "./public-share-setting-card";

function dayLabel(dayNumber: number, startDate: string | null) {
  if (!startDate) return `Day ${dayNumber}`;
  return `Day ${dayNumber} · ${format(addDays(parseISO(startDate), dayNumber - 1), "MMM d")}`;
}

export function LongImageSettingsFields({
  dayCount,
  onSettingChange,
  settings,
  sharePages,
  startDate,
}: {
  dayCount: number;
  onSettingChange: <Key extends keyof ShareSettings>(key: Key, value: ShareSettings[Key]) => void;
  settings: ShareSettings;
  sharePages: PublicItineraryLink[];
  startDate: string | null;
}) {
  const customRange =
    settings.longImageStartDayNumber !== null && settings.longImageEndDayNumber !== null;
  const startDay = settings.longImageStartDayNumber ?? 1;
  const endDay = settings.longImageEndDayNumber ?? dayCount;
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);

  function chooseEntireTrip() {
    onSettingChange("longImageStartDayNumber", null);
    onSettingChange("longImageEndDayNumber", null);
  }

  function chooseDateRange() {
    onSettingChange("longImageStartDayNumber", 1);
    onSettingChange("longImageEndDayNumber", dayCount);
  }

  return (
    <ShareSettingSection
      description="Choose what appears in the image and where its QR code opens. Save before generating."
      title="Long image"
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Days included</legend>
        <div className="grid grid-cols-2 border">
          <button
            aria-pressed={!customRange}
            className="min-h-11 border-r px-3 text-sm font-medium aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            onClick={chooseEntireTrip}
            type="button"
          >
            Entire trip
          </button>
          <button
            aria-pressed={customRange}
            className="min-h-11 px-3 text-sm font-medium aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            onClick={chooseDateRange}
            type="button"
          >
            Date range
          </button>
        </div>
      </fieldset>

      {customRange ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="long-image-range-start">From</Label>
            <Select
              onValueChange={(value) => {
                const nextStart = Number(value);
                onSettingChange("longImageStartDayNumber", nextStart);
                if (nextStart > endDay) onSettingChange("longImageEndDayNumber", nextStart);
              }}
              value={String(startDay)}
            >
              <SelectTrigger className="min-h-11 min-w-0" id="long-image-range-start">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {days.map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {dayLabel(day, startDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="long-image-range-end">Through</Label>
            <Select
              onValueChange={(value) => onSettingChange("longImageEndDayNumber", Number(value))}
              value={String(endDay)}
            >
              <SelectTrigger className="min-h-11 min-w-0" id="long-image-range-end">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {days.slice(startDay - 1).map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {dayLabel(day, startDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      <div className="min-w-0 space-y-1.5 border-t pt-4">
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

      <ShareSettingToggle
        checked={settings.allowLongImageDownload}
        description="Visitors to the shareable page can download your latest generated image."
        id="share-allow-long-image-download"
        label="Allow visitor downloads"
        onCheckedChange={(value) => onSettingChange("allowLongImageDownload", value)}
      />
    </ShareSettingSection>
  );
}
