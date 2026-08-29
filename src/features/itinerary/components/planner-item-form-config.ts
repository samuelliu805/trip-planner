import {
  transportModeLabels,
  type CarRentalDetails,
  type ItineraryItemType,
  type TransportMode,
} from "../types.ts";

export function plannerItemTitle({
  carAction,
  placeName,
  title,
  transportMode,
  type,
}: {
  carAction: CarRentalDetails["action"];
  placeName?: string;
  title: string;
  transportMode: TransportMode;
  type: ItineraryItemType;
}) {
  if (type === "car_rental") return carAction === "pickup" ? "Pickup" : "Return";
  if (type === "transport") return transportModeLabels[transportMode];
  if (["location", "hotel", "meal"].includes(type)) return title.trim() || placeName || "";
  return title.trim();
}

const semanticActionLabels = new Set([
  "Ticket",
  "Booking",
  "Menu",
  "Website",
  "Check in",
  "Open",
  "Directions",
]);

export function normalizedActionLabel(label: string) {
  return semanticActionLabels.has(label) ? label : "Open";
}

export function itemFormFieldLabels(type: ItineraryItemType) {
  const placeLabel =
    type === "location"
      ? "City location"
      : type === "hotel"
        ? "Address"
        : type === "car_rental"
          ? "Address"
          : type === "flight"
            ? "Airport or terminal"
            : type === "train"
              ? "Station"
              : type === "transport"
                ? "Stop or location"
                : type === "note"
                  ? "Related place"
                  : "Location";
  const linkLabel =
    type === "hotel"
      ? "Hotel link"
      : type === "meal"
        ? "Restaurant link"
        : type === "car_rental"
          ? "Rental link"
          : type === "activity"
            ? "Activity link"
            : type === "transport"
              ? "Transport link"
              : "Link";
  return { linkLabel, placeLabel };
}

export function itemFormCapabilities(
  type: ItineraryItemType,
  carAction: CarRentalDetails["action"],
) {
  return {
    supportsLink: !["location", "note"].includes(type),
    supportsPlace: true,
    supportsPrice:
      !["location", "note"].includes(type) && !(type === "car_rental" && carAction === "return"),
    supportsTime: [
      "location",
      "activity",
      "car_rental",
      "meal",
      "transport",
      "flight",
      "train",
    ].includes(type),
  };
}

export const itemCopy: Record<ItineraryItemType, { label: string; placeholder: string }> = {
  activity: { label: "Activity", placeholder: "e.g. Louvre Museum" },
  car_rental: { label: "Car rental", placeholder: "" },
  flight: { label: "Flight", placeholder: "e.g. UA 238 to Tokyo" },
  hotel: { label: "Hotel", placeholder: "e.g. Park Hotel Tokyo" },
  location: { label: "City", placeholder: "e.g. Paris" },
  meal: { label: "Meal", placeholder: "e.g. Dinner at Septime" },
  note: { label: "Note", placeholder: "Add a reminder or detail" },
  train: { label: "Train", placeholder: "e.g. Eurostar to Paris" },
  transport: { label: "Transport", placeholder: "e.g. Airport to city center" },
};

const creationFeedbackTypes: ItineraryItemType[] = [
  "activity",
  "car_rental",
  "flight",
  "hotel",
  "meal",
  "train",
  "transport",
];

/** Categories whose creation result is reported in the prominent planner feedback banner. */
export function plannerItemCreationReportsFeedback(type: ItineraryItemType) {
  return creationFeedbackTypes.includes(type);
}
