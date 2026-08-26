import {
  normalizeTransportMode,
  selectableTransportModes,
  type ItineraryItem,
  type ItineraryItemType,
  type PlannerDay,
} from "@/features/itinerary/types";
import { matrixCategoryColumns } from "@/features/itinerary/components/matrix-columns";

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

const defaultTypeByCategory: Record<Category, ItineraryItemType> = {
  activities: "activity",
  car_rental: "car_rental",
  city: "location",
  hotel: "hotel",
  meals: "meal",
  notes: "note",
  transport: "transport",
};

export const categories: PlannerCategory[] = matrixCategoryColumns.map((column) => ({
  ...column,
  defaultType: defaultTypeByCategory[column.id],
}));

export function isCategoryAtCapacity(day?: PlannerDay, category?: PlannerCategory) {
  if (!day || !category) return false;
  if (category.id === "hotel") {
    return day.items.some((item) => category.types.includes(item.type));
  }
  if (category.id !== "transport") return false;
  const usedModes = day.items
    .filter((item) => item.type === "transport")
    .map((item) => normalizeTransportMode((item.details as Record<string, string>).mode));
  return usedModes.length >= selectableTransportModes.length;
}

export function plannerSelectionSize(
  anchor: { row: number; column: number },
  end: { row: number; column: number },
) {
  return end.row < 0
    ? 0
    : (Math.abs(anchor.row - end.row) + 1) * (Math.abs(anchor.column - end.column) + 1);
}
