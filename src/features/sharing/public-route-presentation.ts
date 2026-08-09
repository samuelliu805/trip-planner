import { buildPublicRouteLines, publicDayRoutePlan } from "./public-map-model";
import type { PublicItinerary, PublicRouteCalculation } from "./types";

export function publicDayRoutePresentation(
  itinerary: PublicItinerary,
  dayPlan: ReturnType<typeof publicDayRoutePlan>,
  dayCalculation?: PublicRouteCalculation,
) {
  const { day, items: candidates } = dayPlan;
  const routeSetupItems = [...candidates, ...dayPlan.unmappedActivities].sort((left, right) => {
    if (left.ref === dayPlan.startRef) return -1;
    if (right.ref === dayPlan.startRef) return 1;
    if (left.ref === dayPlan.endRef) return 1;
    if (right.ref === dayPlan.endRef) return -1;
    return left.sortOrder - right.sortOrder;
  });
  const savedRoute = itinerary.savedRoutes.find(({ dayRef }) => dayRef === day?.ref);
  const savedStopRefs = new Set(savedRoute?.stops.map(({ ref }) => ref) ?? []);
  const omittedActivityCount = candidates.filter(
    (item) => item.type === "activity" && savedRoute && !savedStopRefs.has(item.ref),
  ).length;
  const savedLines = savedRoute
    ? buildPublicRouteLines(savedRoute.legs, itinerary.variant.color, `saved:${savedRoute.ref}`)
    : [];
  const temporaryDayLines = dayCalculation
    ? buildPublicRouteLines(dayCalculation.legs, itinerary.variant.color, `temporary:${day?.ref}`)
    : [];
  return { omittedActivityCount, routeSetupItems, savedLines, savedRoute, temporaryDayLines };
}
