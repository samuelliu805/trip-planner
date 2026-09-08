import { addDays, format, parseISO } from "date-fns";

import {
  defaultTripCurrencyForRegion,
  defaultTripDayCount,
  defaultTripTitle,
  tripDateInZone,
} from "../trips/create-defaults.ts";

import type { GuestRegion, GuestTripDraft } from "./schema.ts";

const isoDay = (date: Date) => format(date, "yyyy-MM-dd");

export function createGuestTripDraft(
  region: GuestRegion,
  timezone: string,
  now = new Date(),
  createId: () => string = () => crypto.randomUUID(),
): GuestTripDraft {
  const draftId = createId();
  const variantId = createId();
  const createdAt = now.toISOString();
  const today = tripDateInZone(timezone, now);
  return {
    createdAt,
    draftId,
    region,
    revision: 0,
    schemaVersion: 1,
    trip: {
      content_version: 1,
      created_at: createdAt,
      currency: defaultTripCurrencyForRegion(region),
      day_count: defaultTripDayCount,
      end_date: null,
      id: draftId,
      owner_id: "guest",
      role: "owner",
      start_date: null,
      status: "open",
      timezone,
      title: defaultTripTitle(today),
      updated_at: createdAt,
      version: 1,
    },
    updatedAt: createdAt,
    workspace: {
      days: [
        {
          content_version: 1,
          date: null,
          day_number: 1,
          id: createId(),
          items: [],
          items_version: 1,
          notes: null,
          title: null,
          variant_id: variantId,
          version: 1,
        },
      ],
      routePlans: [],
      variant: {
        color: "#167A5A",
        content_version: 1,
        days_version: 1,
        id: variantId,
        is_primary: true,
        items_version: 1,
        name: "Main plan",
        trip_id: draftId,
        version: 1,
      },
    },
  };
}

export function guestDaysForCount(
  draft: GuestTripDraft,
  count: number,
  createId: () => string = () => crypto.randomUUID(),
) {
  const current = draft.workspace.days;
  const days = Array.from({ length: count }, (_, index) => {
    const existing = current[index];
    return (
      existing ?? {
        content_version: 1,
        date: null,
        day_number: index + 1,
        id: createId(),
        items: [],
        items_version: 1,
        notes: null,
        title: null,
        variant_id: draft.workspace.variant.id,
        version: 1,
      }
    );
  });
  return days.map((day, index) => ({
    ...day,
    date: draft.trip.start_date ? isoDay(addDays(parseISO(draft.trip.start_date), index)) : null,
    day_number: index + 1,
  }));
}
