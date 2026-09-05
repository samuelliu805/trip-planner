import { addDays, format, parseISO } from "date-fns";

import type { Json } from "../../types/database.ts";
import type { CreateItineraryItemInput } from "../itinerary/item-schema.ts";
import type { ItineraryItem, PlannerDay } from "../itinerary/types.ts";

import type { GuestTripDraft } from "./schema.ts";

const isoDay = (date: Date) => format(date, "yyyy-MM-dd");

export function serializableDetails(details: CreateItineraryItemInput["details"]) {
  return JSON.parse(JSON.stringify(details ?? {})) as Json;
}

export function itemLinks(
  itemId: string,
  links: Array<{ label: string; url: string }> | undefined,
  createId: () => string,
) {
  return (links ?? []).map((link, sort_order) => ({
    ...link,
    id: createId(),
    item_id: itemId,
    sort_order,
  }));
}

export function placeForItem(
  placeId: string | null | undefined,
  snapshot: CreateItineraryItemInput["placeSnapshot"] | undefined,
  existing: ItineraryItem | undefined,
  createId: () => string,
) {
  if (snapshot === undefined) return placeId === null ? null : (existing?.place ?? null);
  if (!snapshot) return null;
  return {
    ...snapshot,
    coordinateSystem: "wgs84" as const,
    id: placeId ?? existing?.place_id ?? createId(),
  };
}

export function withTripDates(draft: GuestTripDraft, days: PlannerDay[]): GuestTripDraft {
  const dayCount = days.length;
  const normalizedDays = days.map((day, index) => ({
    ...day,
    date: draft.trip.start_date ? isoDay(addDays(parseISO(draft.trip.start_date), index)) : null,
    day_number: index + 1,
  }));
  return {
    ...draft,
    trip: {
      ...draft.trip,
      day_count: dayCount,
      end_date: draft.trip.start_date
        ? isoDay(addDays(parseISO(draft.trip.start_date), dayCount - 1))
        : null,
    },
    workspace: { ...draft.workspace, days: normalizedDays },
  };
}
