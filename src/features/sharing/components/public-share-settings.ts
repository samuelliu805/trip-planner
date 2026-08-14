import type { PublicItinerarySettingsInput } from "../schema";
import type { PublicItineraryLink, PublicView } from "../types";

export type ShareSettings = Omit<PublicItinerarySettingsInput, "variantId">;

export const defaultShareSettings: ShareSettings = {
  allowRouteExplore: true,
  defaultView: "timeline",
  shareDescription: "",
  shareTitle: "",
  showAddresses: false,
  showMapRoutes: true,
  showNotes: false,
  showPlacePhotos: false,
  showQuickActionLinks: true,
  showTimes: true,
  templateId: "bento",
  templateVersion: 1,
};

export const publicViewLabels: Record<PublicView, string> = {
  overview: "Overview",
  table: "Table",
  timeline: "Timeline",
};

export function settingsFromLink(link?: PublicItineraryLink): ShareSettings {
  if (!link) return defaultShareSettings;
  return {
    allowRouteExplore: link.allowRouteExplore,
    defaultView: link.defaultView,
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
