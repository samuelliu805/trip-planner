import type { ItineraryItemType } from "@/features/itinerary/types";

export type MatrixCategoryColumn = {
  id: "city" | "activities" | "transport" | "hotel" | "car_rental" | "meals" | "notes";
  label: string;
  types: ItineraryItemType[];
  width: string;
};

export const matrixCategoryColumns: MatrixCategoryColumn[] = [
  { id: "city", label: "Locality", types: [], width: "w-36" },
  { id: "activities", label: "Activities", types: ["activity"], width: "w-52" },
  {
    id: "transport",
    label: "Transport",
    types: ["transport", "flight", "train"],
    width: "w-44",
  },
  { id: "hotel", label: "Hotel", types: ["hotel"], width: "w-44" },
  { id: "car_rental", label: "Car rental", types: ["car_rental"], width: "w-44" },
  { id: "meals", label: "Meals", types: ["meal"], width: "w-44" },
  { id: "notes", label: "Notes", types: ["note"], width: "w-52" },
];
