import { itemCopy, itemFormCapabilities } from "./planner-item-form-config.ts";
import { plannerJourneyFieldCapabilities } from "../transport-form-fields.ts";
import type { CarRentalDetails, ItineraryItemType, TransportMode } from "../types.ts";
import type { PlaceSnapshot } from "../../../lib/providers/places/types.ts";

export type ItemFormBlock =
  | "attachments"
  | "carAction"
  | "carProvider"
  | "endpoints"
  | "journeySchedule"
  | "links"
  | "notes"
  | "order"
  | "place"
  | "price"
  | "serviceNumber"
  | "startTime"
  | "title"
  | "transportMode";

export type ItemFormStep = {
  blocks: ItemFormBlock[];
  id: "basics" | "route" | "files" | "schedule" | "extras" | "order";
  title: string;
};

type StepInput = {
  carAction: CarRentalDetails["action"];
  transportMode: TransportMode;
  type: ItineraryItemType;
};

function basicsBlocks(type: ItineraryItemType, endpoints: boolean): ItemFormBlock[] {
  if (type === "location") return ["place", "title"];
  if (type === "hotel") return ["place", "title"];
  if (type === "car_rental") return ["carAction", "carProvider", "place"];
  if (type === "transport") return endpoints ? ["transportMode", "endpoints"] : ["transportMode"];
  if (type === "flight" || type === "train") return endpoints ? ["title", "endpoints"] : ["title"];
  return ["title", "place"];
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
  const journeyItem = ["flight", "train", "transport"].includes(type);
  const journeySchedule = journey.departureTime || journey.arrivalTime;
  const ownTime = supportsTime && !["flight", "train", "transport"].includes(type);
  // Step titles stay one short word so the longest six-step journey still fits a 390px bar.
  const steps: ItemFormStep[] = [
    {
      blocks: basicsBlocks(type, journey.endpoints),
      id: "basics",
      title: type === "car_rental" ? "Rental" : itemCopy[type].label,
    },
  ];
  if (journeySchedule) steps.push({ blocks: ["journeySchedule"], id: "schedule", title: "Time" });
  steps.push({
    blocks: supportsLink ? ["links", "attachments"] : ["attachments"],
    id: "files",
    title: supportsLink ? "Links" : "Files",
  });

  if (journeyItem) {
    const details: ItemFormBlock[] = [];
    if (journey.serviceNumber) details.push("serviceNumber");
    if (supportsPrice) details.push("price");
    details.push("notes");
    steps.push({ blocks: details, id: "extras", title: "Detail" });
  } else if (type === "meal") {
    steps.push({
      blocks: supportsPrice ? ["startTime", "notes", "price"] : ["startTime", "notes"],
      id: "extras",
      title: "Detail",
    });
  } else {
    const closing: ItemFormBlock[] = [];
    if (ownTime) {
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
        title: closing.includes("price") ? "Detail" : "Notes",
      });
  }
  if (["activity", "meal"].includes(type))
    steps.push({ blocks: ["order"], id: "order", title: "Order" });
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
  if (step.blocks.includes("place")) {
    if (type === "location" && !place) return "Choose a city from Google Maps before continuing.";
    if (type === "hotel" && !place && !title.trim())
      return "Choose a hotel location or enter a displayed hotel name.";
  }
  if (step.id !== "basics") return undefined;
  if (!["car_rental", "hotel", "location", "transport"].includes(type) && !title.trim())
    return `${itemCopy[type].label} name is required.`;
  return undefined;
}
