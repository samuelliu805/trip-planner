import {
  normalizeTransportMode,
  transportModes,
  type ItineraryItem,
  type ItineraryItemType,
  type PlannerDay,
} from "@/features/itinerary/types";

export type Category =
  "city" | "activities" | "transport" | "hotel" | "car_rental" | "meals" | "notes";

export type EditorState = {
  dayId: string;
  item?: ItineraryItem;
  type: ItineraryItemType;
};

export type PlannerCategory = {
  id: Category;
  label: string;
  types: ItineraryItemType[];
  defaultType: ItineraryItemType;
  width: string;
};

export const categories: PlannerCategory[] = [
  { id: "city", label: "City", types: ["location"], defaultType: "location", width: "w-36" },
  {
    id: "activities",
    label: "Activities",
    types: ["activity"],
    defaultType: "activity",
    width: "w-52",
  },
  {
    id: "transport",
    label: "Transport",
    types: ["transport", "flight", "train"],
    defaultType: "transport",
    width: "w-44",
  },
  { id: "hotel", label: "Hotel", types: ["hotel"], defaultType: "hotel", width: "w-44" },
  {
    id: "car_rental",
    label: "Car rental",
    types: ["car_rental"],
    defaultType: "car_rental",
    width: "w-44",
  },
  { id: "meals", label: "Meals", types: ["meal"], defaultType: "meal", width: "w-44" },
  { id: "notes", label: "Notes", types: ["note"], defaultType: "note", width: "w-52" },
];

export function isCategoryAtCapacity(day?: PlannerDay, category?: PlannerCategory) {
  if (!day || !category) return false;
  if (category.id === "hotel") {
    return day.items.some((item) => category.types.includes(item.type));
  }
  if (category.id !== "transport") return false;
  const usedModes = day.items
    .filter((item) => item.type === "transport")
    .map((item) => normalizeTransportMode((item.details as Record<string, string>).mode));
  return usedModes.length >= transportModes.length;
}

export function plannerSelectionSize(
  anchor: { row: number; column: number },
  end: { row: number; column: number },
) {
  return end.row < 0
    ? 0
    : (Math.abs(anchor.row - end.row) + 1) * (Math.abs(anchor.column - end.column) + 1);
}
