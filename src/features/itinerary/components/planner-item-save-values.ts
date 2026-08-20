import {
  itemFormCapabilities,
  plannerItemTitle,
} from "@/features/itinerary/components/planner-item-form-config";
import { isDestinationActivity } from "@/features/itinerary/activity-order";
import type { PlannerItemFormState } from "@/features/itinerary/components/use-planner-item-form-state";
import { plannerJourneyFieldCapabilities } from "@/features/itinerary/transport-form-fields";
import type { ItineraryItem, ItineraryItemType } from "@/features/itinerary/types";
import type { Json } from "@/types/database";

/** Builds the create/update payload from the live form state, unchanged by the step grouping. */
export function plannerItemSaveValues({
  item,
  state,
  tripId,
  type,
  variantId,
}: {
  item?: ItineraryItem;
  state: PlannerItemFormState;
  tripId: string;
  type: ItineraryItemType;
  variantId: string;
}) {
  const {
    arrivalTime,
    arrivalDate,
    carAction,
    carProvider,
    destination,
    departureDate,
    existingDetails,
    links,
    insertAfterItemId,
    notes,
    origin,
    place,
    priceAmount,
    priceCurrency,
    serviceNumber,
    startTime,
    title,
    transportMode,
  } = state;
  const savedTitle = plannerItemTitle({
    carAction,
    placeName: place?.displayName,
    title,
    transportMode,
    type,
  });
  if (!savedTitle) return null;
  const journey = plannerJourneyFieldCapabilities(type, transportMode);
  const placeText = place?.formattedAddress ?? place?.displayName ?? null;
  const details: Record<string, Json> =
    type === "car_rental"
      ? {
          ...existingDetails,
          action: carAction,
          address: placeText,
          provider: carProvider || null,
        }
      : type === "hotel"
        ? { ...existingDetails, address: placeText }
        : type === "meal"
          ? { ...existingDetails, location: placeText }
          : ["transport", "flight", "train"].includes(type)
            ? {
                ...existingDetails,
                arrivalTime: journey.arrivalTime ? arrivalTime || null : null,
                arrivalDate: journey.dates ? arrivalDate || null : existingDetails.arrivalDate,
                departureDate: journey.dates
                  ? departureDate || null
                  : existingDetails.departureDate,
                destination: journey.endpoints ? destination || null : null,
                mode: type === "transport" ? transportMode : type,
                origin: journey.endpoints ? origin || null : null,
                serviceNumber: journey.serviceNumber ? serviceNumber || null : null,
              }
            : type === "activity"
              ? { ...existingDetails, location: placeText }
              : {};
  const { supportsLink, supportsPlace, supportsPrice, supportsTime } = itemFormCapabilities(
    type,
    carAction,
  );
  const googlePlace =
    place?.provider === "google" && place.providerPlaceId
      ? {
          administrativeAreaName: place.administrativeAreaName,
          countryCode: place.countryCode,
          displayName: place.displayName,
          formattedAddress: place.formattedAddress,
          latitude: place.latitude,
          ...(place.localitySource === "google_address_component" &&
            place.localityKind !== "legacy_city" && {
              localityKind: place.localityKind,
              localityName: place.localityName,
              localitySource: "google_address_component" as const,
            }),
          longitude: place.longitude,
          provider: "google" as const,
          providerPlaceId: place.providerPlaceId,
        }
      : undefined;
  return {
    bookingUrl: supportsLink ? (links[0]?.url ?? "") : "",
    links: supportsLink ? links : [],
    insertAfterItemId: isDestinationActivity({ type }) ? insertAfterItemId : undefined,
    details: details as never,
    endTime: journey.arrivalTime ? arrivalTime : "",
    notes: type === "note" ? "" : notes,
    priceAmount: supportsPrice && priceAmount ? Number(priceAmount) : null,
    priceCurrency: supportsPrice && priceAmount ? priceCurrency : null,
    startTime: supportsTime && (type !== "transport" || journey.departureTime) ? startTime : "",
    title: savedTitle,
    tripId,
    type,
    variantId,
    placeId: supportsPlace && place ? item?.place_id : null,
    placeSnapshot: supportsPlace ? googlePlace : undefined,
  };
}
