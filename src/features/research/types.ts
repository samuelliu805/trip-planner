import type { Tables } from "@/types/database";

export const researchCategories = ["flight", "stay", "train", "rental"] as const;

export type ResearchCategory = (typeof researchCategories)[number];
export type ResearchItem = Tables<"research_items">;

export const researchCategoryLabels: Record<ResearchCategory, string> = {
  flight: "Flights",
  rental: "Rentals",
  stay: "Stays",
  train: "Trains",
};

export const researchCategorySingularLabels: Record<ResearchCategory, string> = {
  flight: "Flight",
  rental: "Rental",
  stay: "Stay",
  train: "Train",
};

export type PlanResearchItem = Pick<
  ResearchItem,
  "category" | "day_id" | "id" | "itinerary_item_id"
>;

export type ResearchMutationResult<T> =
  { data: T; error?: never } | { data?: never; error: string };

export type ResearchSort = "price" | "recent";
