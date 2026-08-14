import {
  BedDouble,
  CarFront,
  MapPin,
  NotebookText,
  Plane,
  Route,
  Sparkles,
  TrainFront,
  Utensils,
} from "lucide-react";

import type { PublicItineraryItem } from "../types";

export const publicItemTypeLabels: Record<PublicItineraryItem["type"], string> = {
  activity: "Activity",
  car_rental: "Car rental",
  flight: "Flight",
  hotel: "Hotel",
  location: "Location",
  meal: "Meal",
  note: "Note",
  train: "Train",
  transport: "Transport",
};

export function PublicItemIcon({
  className = "size-4",
  type,
}: {
  className?: string;
  type: PublicItineraryItem["type"];
}) {
  const Icon =
    type === "meal"
      ? Utensils
      : type === "hotel"
        ? BedDouble
        : type === "car_rental"
          ? CarFront
          : type === "flight"
            ? Plane
            : type === "train"
              ? TrainFront
              : type === "transport"
                ? Route
                : type === "note"
                  ? NotebookText
                  : type === "location"
                    ? MapPin
                    : Sparkles;
  return <Icon aria-hidden="true" className={className} />;
}
