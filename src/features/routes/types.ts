import type { DayRoute, ItineraryItem, PlannerDay } from "@/features/itinerary/types";
import type { Enums } from "@/types/database";

export type RouteTravelMode = Enums<"route_travel_mode">;
export type RouteStop = {
  itemId: string;
  latitude: number;
  longitude: number;
  title: string;
};

export type DayRouteState = {
  cached: DayRoute | null;
  currentSignature: string | null;
  isStale: boolean;
  stops: RouteStop[];
};

export function eligibleRouteItems(day: PlannerDay): ItineraryItem[] {
  return day.items.filter((item) => item.type !== "flight" && item.place !== null);
}

export type ConfigureDayRouteInput = {
  dayId: string;
  itemIds: string[];
  travelMode: RouteTravelMode;
};
