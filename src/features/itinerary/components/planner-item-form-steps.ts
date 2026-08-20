import { itemCopy, itemFormCapabilities } from "./planner-item-form-config.ts";
import { plannerJourneyFieldCapabilities } from "../transport-form-fields.ts";
import type { CarRentalDetails, ItineraryItemType, TransportMode } from "../types.ts";
import type { PlaceSnapshot } from "../../../lib/providers/places/types.ts";

export type ItemFormBlock =
  | "attachments"
  | "carAction"
  | "carProvider"
  | "endpoints"
  | "journeyTimes"
  | "links"
  | "notes"
  | "place"
  | "placement"
  | "price"
  | "serviceNumber"
  | "startTime"
  | "title"
  | "transportMode";

export type ItemFormStep = {
  blocks: ItemFormBlock[];
  id: "basics" | "route" | "files" | "schedule" | "extras" | "place";
  title: string;
};

type StepInput = {
  carAction: CarRentalDetails["action"];
  transportMode: TransportMode;
  type: ItineraryItemType;
};

function basicsBlocks(type: ItineraryItemType, serviceNumber: boolean): ItemFormBlock[] {
  if (type === "car_rental") return ["carAction", "place", "carProvider"];
  if (type === "transport")
    return serviceNumber ? ["transportMode", "serviceNumber"] : ["transportMode"];
  if (type === "flight" || type === "train")
    return serviceNumber ? ["title", "serviceNumber"] : ["title"];
  if (["hotel", "location", "meal"].includes(type)) return ["place", "title"];
  if (type === "note") return ["title"];
  return ["title", "place"];
}

/** Activities and Meals share the Day's manual order, so ordering is their closing step. */
export function plannerItemIsPlaceable(type: ItineraryItemType) {
  return ["activity", "meal"].includes(type);
}

/**
 * Groups every field of one itinerary item type into short ordered steps. The first step only
 * carries what an item needs to exist, so it can be saved without opening the rest.
 */
export function plannerItemFormSteps({
  carAction,
  transportMode,
  type,
}: StepInput): ItemFormStep[] {
  const journey = plannerJourneyFieldCapabilities(type, transportMode);
  const { supportsLink, supportsPrice, supportsTime } = itemFormCapabilities(type, carAction);
  const journeyTimes = journey.departureTime || journey.arrivalTime;
  const ownTime = supportsTime && !["flight", "train", "transport"].includes(type);
  // Step titles stay one short word so five circles still fit a 390px bar.
  const steps: ItemFormStep[] = [
    {
      blocks: basicsBlocks(type, journey.serviceNumber),
      id: "basics",
      title: type === "car_rental" ? "Rental" : itemCopy[type].label,
    },
  ];
  if (journey.endpoints) steps.push({ blocks: ["endpoints"], id: "route", title: "Route" });
  steps.push({
    blocks: supportsLink ? ["links", "attachments"] : ["attachments"],
    id: "files",
    title: supportsLink ? "Links" : "Files",
  });

  const closing: ItemFormBlock[] = [];
  if (journeyTimes) {
    steps.push({ blocks: ["journeyTimes"], id: "schedule", title: "Times" });
    if (supportsPrice) closing.push("price");
  } else if (ownTime) {
    steps.push({
      blocks: supportsPrice ? ["startTime", "price"] : ["startTime"],
      id: "schedule",
      title: "Time",
    });
  } else if (supportsPrice) closing.push("price");
  if (type !== "note") closing.push("notes");
  if (closing.length)
    steps.push({
      blocks: closing,
      id: "extras",
      title: closing.includes("price") ? "Price" : "Notes",
    });
  if (plannerItemIsPlaceable(type))
    steps.push({ blocks: ["placement"], id: "place", title: "Place" });
  return steps;
}

export function plannerItemStepError({
  place,
  step,
  title,
  type,
}: {
  place: PlaceSnapshot | null;
  step: ItemFormStep;
  title: string;
  type: ItineraryItemType;
}) {
  if (step.id !== "basics") return undefined;
  if (type === "location" && !place) return "Choose a city from Google Maps before continuing.";
  if (type === "hotel" && !place && !title.trim())
    return "Choose a hotel location or enter a displayed hotel name.";
  if (!["car_rental", "hotel", "location", "transport"].includes(type) && !title.trim())
    return `${itemCopy[type].label} name is required.`;
  return undefined;
}
