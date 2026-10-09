import React from "react";
import { useDayRoute } from "../../../src/features/routes/use-day-route";
import { useOverviewRoute } from "../../../src/features/routes/use-overview-route";
import { useRouteTasks } from "../../../src/features/routes/use-route-tasks";

export function RouteProbe({ workspace }) {
  const tripId = workspace.variant.trip_id,
    variantId = workspace.variant.id;
  const route = useDayRoute(workspace, workspace.days[0], tripId);
  const stages = workspace.days[0].items.map((item, index) => ({
    id: item.id,
    placeId: item.place?.id ?? item.id,
    placeKey: item.id,
    position: index + 1,
    latitude: item.place?.latitude ?? index,
    longitude: item.place?.longitude ?? index,
    entries: [{ itemId: item.id, title: item.title, dayLabel: "Day 1", dayNumber: 1 }],
    dayRangeLabel: "Day 1",
    firstDayLabel: "Day 1",
  }));
  const overview = useOverviewRoute(stages, ["self_driving"], tripId, variantId);
  const tasks = useRouteTasks(tripId, variantId);
  React.useEffect(() => {
    window.__dayRoute = route;
    window.__overviewRoute = overview;
    window.__routes = tasks;
  }, [route, overview, tasks]);
  return (
    <section aria-label="Route test controls">
      <button onClick={route.openEdit}>Edit day route</button>
      <button onClick={() => route.setLegMode(0, "taxi")}>Day taxi</button>
      <button onClick={() => route.setLegMode(0, "walk")}>Day walk</button>
      <button onClick={() => void route.saveAndCalculate()}>Calculate day</button>
      <button onClick={route.cancelEditing}>Close day route</button>
      <button onClick={() => void route.clearRoute()}>Clear day route fixture confirmation</button>
      <button onClick={() => overview.setMode(1, "train")}>Overview train</button>
      <button onClick={() => overview.setMode(1, "bus")}>Overview bus</button>
      <button onClick={() => void overview.calculate()}>Calculate overview</button>
      <button onClick={overview.reset}>Reset overview</button>
      <output data-route-mode>{route.draft?.legModes[0] ?? "closed"}</output>
      <output data-overview-count>{overview.calculatedLegs.length}</output>
    </section>
  );
}
