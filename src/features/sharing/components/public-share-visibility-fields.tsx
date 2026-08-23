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
    <>
      <ShareSettingSection
        description="Choose the itinerary content included on the published page."
        title="Page content"
      >
        <div
          aria-label="Content included in the shareable page"
          className="grid min-w-0 gap-2 sm:grid-cols-2"
          role="group"
        >
          <ShareSettingOption
            checked={settings.showAttachments}
            description="Files marked Share file."
            label="Attachments"
            onCheckedChange={(value) => onSettingChange("showAttachments", value)}
          />
          <ShareSettingOption
            checked={settings.showMapRoutes}
            description="Places, maps, and saved routes."
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
            description="Saved web links on itinerary items."
            label="Action links"
            onCheckedChange={(value) => onSettingChange("showQuickActionLinks", value)}
          />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Review notes, links, and files for booking references before publishing.
        </p>
      </ShareSettingSection>

      <ShareSettingSection
        description="Control the level of schedule and location detail visitors can see."
        title="Trip details"
      >
        <div className="grid min-w-0 gap-2 sm:grid-cols-2" role="group">
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
        </div>
      </ShareSettingSection>

      <ShareSettingSection
        description="Choose what visitors can do from the published page."
        title="Visitor tools"
      >
        <div className="grid min-w-0 gap-2 sm:grid-cols-2" role="group">
          <ShareSettingOption
            checked={settings.allowRouteExplore}
            description="Calculate temporary routes between shared stops."
            label="Route exploration"
            onCheckedChange={(value) => onSettingChange("allowRouteExplore", value)}
          />
          <ShareSettingOption
            checked={settings.allowLongImageDownload}
            description="Download the latest generated trip image."
            label="Image downloads"
            onCheckedChange={(value) => onSettingChange("allowLongImageDownload", value)}
          />
        </div>
      </ShareSettingSection>
    </>
  );
}
