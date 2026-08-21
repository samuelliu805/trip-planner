import type { ItineraryItemType, TransportMode } from "./types.ts";

export function plannerJourneyFieldCapabilities(
  type: ItineraryItemType,
  transportMode: TransportMode,
) {
  const mode = type === "flight" || type === "train" ? type : transportMode;
  const selfDirected = ["self_driving", "bike", "walk", "motorcycle"].includes(mode);
  const scheduled = [
    "flight",
    "train",
    "bus",
    "ferry",
    "subway",
    "tram",
    "shuttle",
    "cable_car",
  ].includes(mode);
  const journeyItem = ["transport", "flight", "train"].includes(type);
  const hasTimedJourney = journeyItem && !selfDirected;
  return {
    arrivalTime: hasTimedJourney && scheduled,
    dates: hasTimedJourney,
    departureTime: hasTimedJourney,
    endpoints: journeyItem,
    serviceNumber: journeyItem && scheduled,
  };
}
