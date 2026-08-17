import type { PublicItinerarySettingsInput } from "../schema";
import type { PublicItineraryLink, PublicView } from "../types";

export type ShareSettings = Omit<PublicItinerarySettingsInput, "variantId">;

export const defaultShareSettings: ShareSettings = {
  allowLongImageDownload: true,
  allowRouteExplore: true,
  defaultView: "timeline",
  longImageEndDayNumber: null,
  longImageQrDestination: "current_share_page",
  longImageQrSharePageId: null,
  longImageStartDayNumber: null,
  shareDescription: "",
  shareTitle: "",
  showAddresses: true,
  showMapRoutes: true,
  showNotes: true,
  showPlacePhotos: true,
  showQuickActionLinks: true,
  showTimes: true,
  templateId: "ethereal",
  templateVersion: 1,
};

export const publicViewLabels: Record<PublicView, string> = {
  overview: "Overview",
  table: "Table",
  timeline: "Timeline",
};

export function settingsFromLink(link?: PublicItineraryLink): ShareSettings {
  if (!link) return defaultShareSettings;
  const hasExplicitSharePageTarget =
    link.longImageQrDestination === "share_page" && Boolean(link.longImageQrSharePageId);
  return {
    allowLongImageDownload: link.allowLongImageDownload,
    allowRouteExplore: link.allowRouteExplore,
    defaultView: link.defaultView,
    longImageEndDayNumber: link.longImageEndDayNumber,
    longImageQrDestination: hasExplicitSharePageTarget
      ? link.longImageQrDestination
      : link.longImageQrDestination === "share_page"
        ? "current_share_page"
        : link.longImageQrDestination,
    longImageQrSharePageId: hasExplicitSharePageTarget ? link.longImageQrSharePageId : null,
    longImageStartDayNumber: link.longImageStartDayNumber,
    shareDescription: link.shareDescription ?? "",
    shareTitle: link.shareTitle ?? "",
    showAddresses: link.showAddresses,
    showMapRoutes: link.showMapRoutes,
    showNotes: link.showNotes,
    showPlacePhotos: link.showPlacePhotos,
    showQuickActionLinks: link.showQuickActionLinks,
    showTimes: link.showTimes,
    templateId: link.templateId,
    templateVersion: link.templateVersion,
  };
}
