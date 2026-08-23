import type { ResearchCategory } from "./types.ts";

export type ResearchItemFormStep = {
  id: "primary" | "schedule" | "details";
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
  Partial<Record<ResearchItemFormStep["id"], string>>
> = {
  flight: {
    primary: "Choose the trip type and route. This is enough to save the idea.",
    schedule: "Add the total price, then departure and arrival details when you know them.",
    details: "Add the airline and flight number for each segment, plus any booking records.",
  },
  rental: {
    primary: "Choose the pick-up and return locations. This is enough to save the idea.",
    schedule: "Add the total price, then pick-up and return. Times start at 12:00 PM.",
    details: "Add the rental company, notes, and any booking records you have.",
  },
  stay: {
    primary: "Add a hotel or area and the check-in and check-out dates.",
    details: "Add the total price first, then booking records, a helpful name, and notes.",
  },
  train: {
    primary: "Add the route. This is enough to save the idea.",
    schedule: "Add the total price, then departure and arrival details when you know them.",
    details: "Add the train number and any booking records or notes you have.",
  },
};

/** Keep the essential first page short and move optional scheduling out of it. */
export function researchItemFormSteps(category: ResearchCategory): ResearchItemFormStep[] {
  if (category === "stay")
    return [
      { id: "primary", title: primaryTitles[category] },
      { id: "details", title: "Details" },
    ];
  return [
    { id: "primary", title: primaryTitles[category] },
    { id: "schedule", title: "Price & time" },
    { id: "details", title: "Details" },
  ];
}

export function researchItemPriceStep(category: ResearchCategory): ResearchItemFormStep["id"] {
  return category === "stay" ? "details" : "schedule";
}

export function researchItemStepDescription(
  category: ResearchCategory,
  stepId: ResearchItemFormStep["id"],
) {
  return stepDescriptions[category][stepId] ?? "Add any details that will help you compare.";
}
