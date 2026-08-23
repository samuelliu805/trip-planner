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
  | "rentalTiming"
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
  creating?: boolean;
  includeOrder?: boolean;
  transportMode: TransportMode;
  type: ItineraryItemType;
};

export function plannerItemNeedsOrderStep({
  availableSlots,
  endTime,
  startTime,
  type,
}: {
  availableSlots: number;
  endTime: string;
  startTime: string;
  type: ItineraryItemType;
}) {
  return (
    ["activity", "car_rental", "meal"].includes(type) &&
    !startTime &&
    !endTime &&
    availableSlots > 1
  );
}

export function plannerItemSaveAction({
  activeStepId,
  includeOrder,
}: {
  activeStepId: ItemFormStep["id"];
  includeOrder: boolean;
}) {
  return includeOrder && activeStepId !== "order" ? "confirm-order" : "save";
}

function basicsBlocks(
  type: ItineraryItemType,
  endpoints: boolean,
  journeySchedule: boolean,
  creating: boolean,
): ItemFormBlock[] {
  if (type === "location") return ["place", "title"];
  if (type === "hotel") return ["place", "title"];
  if (type === "meal") return ["place", "title"];
  if (type === "activity" && creating) return ["place", "title"];
  if (type === "car_rental") return ["carAction", "place"];
  if (type === "transport")
    return [
      "transportMode",
      ...(endpoints ? (["endpoints"] as const) : []),
      ...(journeySchedule ? (["journeySchedule"] as const) : []),
    ];
  if (type === "flight" || type === "train")
    return [
      "title",
      ...(endpoints ? (["endpoints"] as const) : []),
      ...(journeySchedule ? (["journeySchedule"] as const) : []),
    ];
  return ["title", "place"];
}

/**
 * Groups every field of one itinerary item type into short ordered steps. The first step only
 * carries what an item needs to exist, so it can be saved without opening the rest.
 */
export function plannerItemFormSteps({
  carAction,
  creating = false,
  includeOrder = true,
  transportMode,
  type,
}: StepInput): ItemFormStep[] {
  const journey = plannerJourneyFieldCapabilities(type, transportMode);
  const { supportsLink, supportsPrice, supportsTime } = itemFormCapabilities(type, carAction);
  const journeyItem = ["flight", "train", "transport"].includes(type);
  const journeySchedule = journey.departureTime || journey.arrivalTime;
  const manualOrderItem = ["activity", "car_rental", "meal"].includes(type);
  const ownTime = supportsTime && !["flight", "train", "transport"].includes(type);
  // Step titles stay one short word so the longest six-step journey still fits a 390px bar.
  const steps: ItemFormStep[] = [
    {
      blocks: basicsBlocks(type, journey.endpoints, journeySchedule, creating),
      id: "basics",
      title: type === "car_rental" ? "Rental" : itemCopy[type].label,
    },
  ];
  const filesStep: ItemFormStep = {
    blocks: supportsLink ? ["links", "attachments"] : ["attachments"],
    id: "files",
    title: supportsLink ? "Links" : "Files",
  };
  if (journeyItem) {
    const details: ItemFormBlock[] = [];
    if (journey.serviceNumber) details.push("serviceNumber");
    if (supportsPrice) details.push("price");
    details.push("notes");
    steps.push({ blocks: details, id: "extras", title: "Detail" });
    steps.push(filesStep);
  } else if (type === "activity") {
    steps.push({
      blocks: supportsPrice ? ["startTime", "price", "notes"] : ["startTime", "notes"],
      id: "extras",
      title: "Detail",
    });
  } else if (type === "meal") {
    steps.push({
      blocks: supportsPrice ? ["startTime", "price", "notes"] : ["startTime", "notes"],
      id: "extras",
      title: "Detail",
    });
  } else if (type === "car_rental") {
    steps.push({
      blocks: supportsPrice ? ["rentalTiming", "price", "notes"] : ["rentalTiming", "notes"],
      id: "extras",
      title: "Detail",
    });
  } else if (type === "hotel") {
    steps.push({ blocks: ["price", "notes"], id: "extras", title: "Detail" });
    steps.push(filesStep);
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
  if (!manualOrderItem && !journeyItem && type !== "hotel") steps.push(filesStep);
  if (manualOrderItem) steps.push(filesStep);
  if (includeOrder && manualOrderItem)
    steps.push({ blocks: ["order"], id: "order", title: "Order" });
  return steps;
}

export function plannerItemStepError({
  creating = false,
  place,
  step,
  title,
  type,
}: {
  creating?: boolean;
  place: PlaceSnapshot | null;
  step: ItemFormStep;
  title: string;
  type: ItineraryItemType;
}) {
  if (step.blocks.includes("place")) {
    if (type === "location" && !place) return "Choose a city from Google Maps before continuing.";
    if (["hotel", "meal"].includes(type) && !place && !title.trim())
      return type === "hotel"
        ? "Choose a hotel location or enter a displayed hotel name."
        : "Choose a meal location or enter a displayed meal name.";
  }
  if (step.id !== "basics") return undefined;
  if (creating && type === "activity" && !title.trim())
    return "Search for an activity or place, or add a custom activity.";
  if (!["car_rental", "hotel", "location", "meal", "transport"].includes(type) && !title.trim())
    return `${itemCopy[type].label} name is required.`;
  return undefined;
}

export function plannerItemFormError({
  creating = false,
  place,
  steps,
  title,
  type,
}: {
  creating?: boolean;
  place: PlaceSnapshot | null;
  steps: ItemFormStep[];
  title: string;
  type: ItineraryItemType;
}) {
  for (const step of steps) {
    const message = plannerItemStepError({ creating, place, step, title, type });
    if (message) return { message, step };
  }
  return undefined;
}
