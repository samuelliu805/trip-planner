import type { OwnerAttachment } from "@/features/attachments/schema";
import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";
import type { DayRoutePlan } from "@/features/routes/types";
import type { PublicItinerary, PublicItineraryLink } from "@/features/sharing/types";
import type { PlaceSnapshot } from "@/lib/providers/places/types";

export interface ItineraryRepository {
  getWorkspace(tripId: string, variantId: string): Promise<PlannerWorkspace | null>;
  getItem(id: string): Promise<ItineraryItem | null>;
  saveItem(item: ItineraryItem): Promise<ItineraryItem>;
  removeItem(id: string): Promise<void>;
}

export interface PlaceRouteRepository {
  savePlace(place: PlaceSnapshot): Promise<{ id: string; place: PlaceSnapshot }>;
  saveRoutePlan(plan: DayRoutePlan): Promise<DayRoutePlan>;
  removeRoutePlan(id: string): Promise<void>;
}

export interface AttachmentMetadataRepository {
  listForItem(itemId: string): Promise<OwnerAttachment[]>;
  finalize(assetId: string): Promise<OwnerAttachment>;
  remove(assetId: string): Promise<void>;
}

export interface ShareSnapshotRepository {
  getPublicSnapshot(token: string): Promise<PublicItinerary | null>;
  listForTrip(tripId: string): Promise<PublicItineraryLink[]>;
  revoke(id: string): Promise<void>;
}
