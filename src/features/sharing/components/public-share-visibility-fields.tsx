import { ChevronDown } from "lucide-react";

import type { ShareSettings } from "./public-share-settings";
import { ShareSettingOption, ShareSettingSection } from "./public-share-setting-card";

export function PublicShareVisibilityFields({
  onSettingChange,
  settings,
}: {
  onSettingChange: <Key extends keyof ShareSettings>(key: Key, value: ShareSettings[Key]) => void;
  settings: ShareSettings;
}) {
  return (
    <ShareSettingSection
      description="Select everything you want people with the link to see."
      title="Shared content"
    >
      <div
        aria-label="Content included in the shareable page"
        className="grid min-w-0 gap-2 sm:grid-cols-2"
        role="group"
      >
        <ShareSettingOption
          checked={settings.showAttachments}
          description="Files marked Public."
          label="Attachments"
          onCheckedChange={(value) => onSettingChange("showAttachments", value)}
        />
        <ShareSettingOption
          checked={settings.showMapRoutes}
          description="Shared places, maps, and safe saved-route details."
          label="Maps and routes"
          onCheckedChange={(value) => onSettingChange("showMapRoutes", value)}
        />
        <ShareSettingOption
          checked={settings.showNotes}
          description="Item, day, and standalone notes."
          label="Notes"
          onCheckedChange={(value) => onSettingChange("showNotes", value)}
        />
        <ShareSettingOption
          checked={settings.showPlacePhotos}
          description="Available Google Place imagery."
          label="Place photos"
          onCheckedChange={(value) => onSettingChange("showPlacePhotos", value)}
        />
        <ShareSettingOption
          checked={settings.showQuickActionLinks}
          description="Saved HTTP(S) links on itinerary items."
          label="Action links"
          onCheckedChange={(value) => onSettingChange("showQuickActionLinks", value)}
        />
      </div>

      <details className="group min-w-0 border-t pt-2">
        <summary className="flex min-h-11 min-w-0 cursor-pointer list-none items-center gap-2 text-sm font-medium marker:hidden">
          <span>More controls</span>
          <span className="ml-auto min-w-0 truncate text-xs font-normal text-muted-foreground">
            Times, addresses, downloads
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="grid min-w-0 gap-2 pt-2 sm:grid-cols-2">
          <ShareSettingOption
            checked={settings.showTimes}
            description="Only times entered in the itinerary."
            label="Times"
            onCheckedChange={(value) => onSettingChange("showTimes", value)}
          />
          <ShareSettingOption
            checked={settings.showAddresses}
            description="Exact address text saved with places."
            label="Exact addresses"
            onCheckedChange={(value) => onSettingChange("showAddresses", value)}
          />
          <ShareSettingOption
            checked={settings.allowRouteExplore}
            description="Visitors can calculate temporary routes from shared stops."
            label="Route exploration"
            onCheckedChange={(value) => onSettingChange("allowRouteExplore", value)}
          />
          <ShareSettingOption
            checked={settings.allowLongImageDownload}
            description="Visitors can download your latest generated trip image."
            label="Image downloads"
            onCheckedChange={(value) => onSettingChange("allowLongImageDownload", value)}
          />
        </div>
      </details>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Notes, links, and attachments can contain booking references. Review them before publishing.
      </p>
    </ShareSettingSection>
  );
}
