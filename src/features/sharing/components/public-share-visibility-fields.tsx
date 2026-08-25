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
      <ShareSettingSection title="Page content">
        <div
          aria-label="Content included in the shareable page"
          data-i18n-aria-label={"Content included in the shareable page"}
          className="grid min-w-0 gap-2 sm:grid-cols-2"
          role="group"
        >
          <ShareSettingOption
            checked={settings.showAttachments}
            label="Attachments"
            onCheckedChange={(value) => onSettingChange("showAttachments", value)}
          />
          <ShareSettingOption
            checked={settings.showMapRoutes}
            label="Maps and routes"
            onCheckedChange={(value) => onSettingChange("showMapRoutes", value)}
          />
          <ShareSettingOption
            checked={settings.showNotes}
            label="Notes"
            onCheckedChange={(value) => onSettingChange("showNotes", value)}
          />
          <ShareSettingOption
            checked={settings.showPlacePhotos}
            label="Place photos"
            onCheckedChange={(value) => onSettingChange("showPlacePhotos", value)}
          />
          <ShareSettingOption
            checked={settings.showQuickActionLinks}
            label="Action links"
            onCheckedChange={(value) => onSettingChange("showQuickActionLinks", value)}
          />
        </div>
      </ShareSettingSection>

      <ShareSettingSection title="Trip details">
        <div className="grid min-w-0 gap-2 sm:grid-cols-2" role="group">
          <ShareSettingOption
            checked={settings.showTimes}
            label="Times"
            onCheckedChange={(value) => onSettingChange("showTimes", value)}
          />
          <ShareSettingOption
            checked={settings.showAddresses}
            label="Exact addresses"
            onCheckedChange={(value) => onSettingChange("showAddresses", value)}
          />
        </div>
      </ShareSettingSection>

      <ShareSettingSection title="Visitor tools">
        <div className="grid min-w-0 gap-2 sm:grid-cols-2" role="group">
          <ShareSettingOption
            checked={settings.allowRouteExplore}
            label="Route exploration"
            onCheckedChange={(value) => onSettingChange("allowRouteExplore", value)}
          />
          <ShareSettingOption
            checked={settings.allowLongImageDownload}
            label="Image downloads"
            onCheckedChange={(value) => onSettingChange("allowLongImageDownload", value)}
          />
        </div>
      </ShareSettingSection>
    </>
  );
}
