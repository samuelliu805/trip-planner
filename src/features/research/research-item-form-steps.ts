import type { ResearchCategory } from "./types.ts";

export type ResearchItemFormStep = {
  id: "primary" | "details";
  title: string;
};

const primaryTitles: Record<ResearchCategory, string> = {
  flight: "Flight",
  rental: "Rental car",
  stay: "Hotel",
  train: "Train",
};

const stepDescriptions: Record<
  ResearchCategory,
  Record<ResearchItemFormStep["id"], string>
> = {
  flight: {
    primary: "Choose the trip type, route, and dates. Times are optional.",
    details: "Add each segment’s airline and the total price. Booking records are optional.",
  },
  rental: {
    primary: "Add the locations and rental dates. Pick-up and return default to 12:00 PM.",
    details: "Add the rental company, notes, and any booking records you have.",
  },
  stay: {
    primary: "Add a hotel or area and the check-in and check-out dates.",
    details: "Add the booking link or files, a helpful name, and any notes.",
  },
  train: {
    primary: "Add the route and travel date. Times are optional.",
    details: "Add the train number and any booking records or notes you have.",
  },
};

/** Keep every research editor to two short, predictable pages. */
export function researchItemFormSteps(category: ResearchCategory): ResearchItemFormStep[] {
  return [
    { id: "primary", title: primaryTitles[category] },
    { id: "details", title: "Details" },
  ];
}

export function researchItemPriceStep(category: ResearchCategory): ResearchItemFormStep["id"] {
  return category === "flight" ? "details" : "primary";
}

export function researchItemStepDescription(
  category: ResearchCategory,
  stepId: ResearchItemFormStep["id"],
) {
  return stepDescriptions[category][stepId];
}
