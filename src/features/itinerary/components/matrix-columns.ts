import type { ItineraryItemType } from "@/features/itinerary/types";

export type MatrixCategoryColumn = {
  id: "city" | "activities" | "transport" | "hotel" | "car_rental" | "meals" | "notes";
  label: string;
  types: ItineraryItemType[];
  width: string;
};

// Widths track the 15px item title / 13px meta type scale: narrower columns truncate every
// place name, which is what made the Matrix hard to read at tablet widths.
export const matrixCategoryColumns: MatrixCategoryColumn[] = [
  { id: "city", label: "City / town", types: [], width: "w-40" },
  { id: "activities", label: "Activities", types: ["activity"], width: "w-56" },
  {
    id: "transport",
    label: "Transport",
    types: ["transport", "flight", "train"],
    width: "w-48",
  },
  { id: "hotel", label: "Hotel", types: ["hotel"], width: "w-48" },
  { id: "car_rental", label: "Car rental", types: ["car_rental"], width: "w-48" },
  { id: "meals", label: "Meals", types: ["meal"], width: "w-48" },
  { id: "notes", label: "Notes", types: ["note"], width: "w-56" },
];
