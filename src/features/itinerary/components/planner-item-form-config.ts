import type { ItineraryItemType } from "@/features/itinerary/types";

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
