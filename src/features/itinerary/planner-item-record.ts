import type { AppRow } from "@/platform/contracts/database";
import { ownerAttachmentsFromRows } from "@/features/attachments/owner-attachment-records";
import type { OwnerAttachmentRow } from "@/features/attachments/owner-attachment-records";

type StoredPlaceRow = Pick<
  AppRow<"places">,
  | "administrative_area_name"
  | "country_code"
  | "display_name"
  | "formatted_address"
  | "google_place_id"
  | "provider_place_id"
  | "coordinate_system"
  | "id"
  | "latitude"
  | "locality_kind"
  | "locality_name"
  | "locality_source"
  | "longitude"
  | "source"
>;

export type WorkspaceItemRow = AppRow<"itinerary_items"> & {
  attachments?: OwnerAttachmentRow[] | null;
  links?: AppRow<"itinerary_item_links">[] | null;
  place?: StoredPlaceRow | null;
};

export function plannerItemFromRow(row: WorkspaceItemRow): import("./types").ItineraryItem {
  const snapshot = row.place;
  return {
    ...row,
    attachments: ownerAttachmentsFromRows(row.attachments),
    links: [...(row.links ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    place:
      snapshot?.display_name &&
      snapshot.coordinate_system === "wgs84" &&
      snapshot.latitude !== null &&
      snapshot.longitude !== null
        ? {
            id: snapshot.id,
            coordinateSystem: "wgs84",
            provider: snapshot.source,
            ...((snapshot.provider_place_id ?? snapshot.google_place_id) && {
              providerPlaceId: snapshot.provider_place_id ?? snapshot.google_place_id!,
            }),
            displayName: snapshot.display_name,
            ...(snapshot.formatted_address && { formattedAddress: snapshot.formatted_address }),
            ...(snapshot.locality_name && { localityName: snapshot.locality_name }),
            ...(snapshot.locality_kind && {
              localityKind:
                snapshot.locality_kind as import("@/lib/providers/places/types").LocalityKind,
            }),
            ...(snapshot.country_code && { countryCode: snapshot.country_code }),
            ...(snapshot.administrative_area_name && {
              administrativeAreaName: snapshot.administrative_area_name,
            }),
            ...(snapshot.locality_source && {
              localitySource:
                snapshot.locality_source as import("@/lib/providers/places/types").LocalitySource,
            }),
            latitude: snapshot.latitude,
            longitude: snapshot.longitude,
          }
        : null,
  };
}
