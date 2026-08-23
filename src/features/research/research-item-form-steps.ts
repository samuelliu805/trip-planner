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

const priceSteps: Record<ResearchCategory, ResearchItemFormStep["id"]> = {
  flight: "details",
  rental: "details",
  stay: "details",
  train: "details",
};

const stepDescriptions: Record<ResearchCategory, Record<ResearchItemFormStep["id"], string>> = {
  flight: {
    primary: "Add the route, departure, and arrival for each flight.",
    details: "Add the price, airline and flight numbers, and any booking records.",
  },
  rental: {
    primary: "Add the locations, pick-up, and return. Times start at 12:00 PM.",
    details: "Add the price, rental company, notes, and any booking records.",
  },
  stay: {
    primary: "Add a hotel or area and the check-in and check-out dates.",
    details: "Add the total price first, then booking records, a helpful name, and notes.",
  },
  train: {
    primary: "Add the route, departure, and arrival.",
    details: "Add the price, train number, and any booking records or notes.",
  },
};

/** Every category uses the same short two-page rhythm. */
export function researchItemFormSteps(category: ResearchCategory): ResearchItemFormStep[] {
  return [
    { id: "primary", title: primaryTitles[category] },
    { id: "details", title: "Details" },
  ];
}

export function researchItemPriceStep(category: ResearchCategory): ResearchItemFormStep["id"] {
  return priceSteps[category];
}

export function researchItemStepDescription(
  category: ResearchCategory,
  stepId: ResearchItemFormStep["id"],
) {
  return stepDescriptions[category][stepId];
}
