import type { ItineraryItem } from "./types.ts";
import {
  flightEndpointDate,
  flightEndpointParentId,
  flightEndpointRole,
} from "./flight-endpoints.ts";

type FlightSchedule = {
  date?: string | null;
  parentId?: string | null;
  role: "departure" | "arrival";
  time?: string | null;
};

/** Correct flight slots without changing the gaps chosen for ordinary activities. */
export function orderFlightStopSlots<Item>(
  items: Item[],
  schedule: (item: Item) => FlightSchedule | null,
): Item[] {
  const stops = items.flatMap((item, index) => {
    const flight = schedule(item);
    return flight ? [{ item, index, flight }] : [];
  });
  if (stops.length < 2) return items;
  const remaining = [...stops];
  const ordered: Item[] = [];
  while (remaining.length) {
    const available = remaining.filter(
      ({ flight }) =>
        flight.role !== "arrival" ||
        !flight.parentId ||
        !remaining.some(
          ({ flight: other }) => other.role === "departure" && other.parentId === flight.parentId,
        ),
    );
    available.sort((left, right) => {
      if (left.flight.date && right.flight.date && left.flight.date !== right.flight.date)
        return left.flight.date.localeCompare(right.flight.date);
      if (left.flight.time && right.flight.time && left.flight.time !== right.flight.time)
        return left.flight.time.localeCompare(right.flight.time);
      return left.index - right.index;
    });
    const next = available[0];
    ordered.push(next.item);
    remaining.splice(remaining.indexOf(next), 1);
  }
  const positions = new Set(stops.map(({ index }) => index));
  let next = 0;
  return items.map((item, index) => (positions.has(index) ? ordered[next++] : item));
}

export function orderOwnerFlightStops<
  Item extends {
    details?: ItineraryItem["details"];
    start_time?: string | null;
  },
>(items: Item[]) {
  return orderFlightStopSlots(items, (item) => {
    const endpoint = { details: item.details ?? null };
    const role = flightEndpointRole(endpoint);
    return role
      ? {
          role,
          parentId: flightEndpointParentId(endpoint),
          date: flightEndpointDate(endpoint),
          time: item.start_time?.slice(0, 5),
        }
      : null;
  });
}
