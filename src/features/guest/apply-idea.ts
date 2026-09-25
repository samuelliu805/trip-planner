import { addIsoDateDays } from "../research/date-range.ts";
import type { ItineraryItem, PlannerDay } from "../itinerary/types.ts";
import type { GuestIdea, GuestTripDraft } from "./schema.ts";
import { guestIdeaJourneys } from "./idea-journeys.ts";
import { appliedGuestIdeaId } from "./idea-records.ts";

function daysBetween(start: string, end: string) {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  );
}

export function guestIdeaRelevantDates(idea: GuestIdea) {
  const journeys = guestIdeaJourneys(idea);
  const dates = journeys.flatMap((journey) =>
    [
      journey.departureDate,
      ...(idea.values.category === "stay" ? [] : [journey.arrivalDate]),
    ].filter((date): date is string => !!date),
  );
  if (idea.values.category === "stay" && idea.values.endDate) {
    const lastNight = addIsoDateDays(idea.values.endDate, -1);
    if (lastNight) dates.push(lastNight);
  }
  return dates.sort();
}

export function applyGuestIdea(
  draft: GuestTripDraft,
  ideaId: string,
  createId: () => string = () => crypto.randomUUID(),
  now = new Date(),
): GuestTripDraft {
  const idea = draft.ideas.find(({ id }) => id === ideaId);
  if (!idea) throw new Error("The local idea no longer exists.");
  if (
    draft.workspace.days.some((day) =>
      day.items.some((item) => appliedGuestIdeaId(item.details) === ideaId),
    )
  )
    throw new Error("This idea is already in the Plan.");
  const journeys = guestIdeaJourneys(idea);
  const value = idea.values;
  const relevantDates = guestIdeaRelevantDates(idea);
  const firstIdeaDate = relevantDates[0];
  const lastIdeaDate = relevantDates.at(-1);
  const currentStart = draft.trip.start_date;
  const currentEnd = draft.trip.end_date;
  const start =
    currentStart && firstIdeaDate
      ? currentStart < firstIdeaDate
        ? currentStart
        : firstIdeaDate
      : (currentStart ?? firstIdeaDate ?? null);
  const currentUndated = !currentStart;
  const endCandidate =
    currentEnd && lastIdeaDate
      ? currentEnd > lastIdeaDate
        ? currentEnd
        : lastIdeaDate
      : (currentEnd ?? lastIdeaDate ?? null);
  const minimumEnd =
    start && currentUndated ? addIsoDateDays(start, draft.workspace.days.length - 1) : null;
  const end =
    endCandidate && minimumEnd
      ? endCandidate > minimumEnd
        ? endCandidate
        : minimumEnd
      : (endCandidate ?? minimumEnd);
  const count = start && end ? daysBetween(start, end) + 1 : draft.workspace.days.length;
  if (count > 366) throw new Error("Trips can span at most 366 days.");
  if (count < 1) throw new Error("Review the idea dates before adding it to the Plan.");
  const existingByDate = new Map(
    draft.workspace.days.map((day, index) => [
      currentStart ? day.date : start ? addIsoDateDays(start, index) : null,
      day,
    ]),
  );
  const days: PlannerDay[] = Array.from({ length: count }, (_, index) => {
    const date = start ? addIsoDateDays(start, index) : null;
    const existing = date ? existingByDate.get(date) : draft.workspace.days[index];
    return existing
      ? { ...existing, date, day_number: index + 1, items: [...existing.items] }
      : {
          content_version: 1,
          date,
          day_number: index + 1,
          id: createId(),
          items: [],
          items_version: 1,
          notes: null,
          title: null,
          variant_id: draft.workspace.variant.id,
          version: 1,
        };
  });
  const timestamp = now.toISOString();
  const type =
    value.category === "stay"
      ? "hotel"
      : value.category === "rental"
        ? "car_rental"
        : value.category;
  for (const [index, journey] of journeys.entries()) {
    const day = journey.departureDate
      ? days.find((candidate) => candidate.date === journey.departureDate)
      : days[0];
    if (!day) throw new Error("The flight date is outside this Plan.");
    const startTime = journey.departureTime ?? null;
    const endTime =
      journey.arrivalDate === journey.departureDate ? (journey.arrivalTime ?? null) : null;
    const title =
      (value.category === "flight" || value.category === "train") &&
      journey.origin &&
      journey.destination
        ? `${journey.origin} → ${journey.destination}`
        : value.title || value.locationText || "Saved idea";
    const item: ItineraryItem = {
      attachments: [],
      booking_url: value.sourceUrl ?? null,
      created_at: timestamp,
      day_id: day.id,
      details: JSON.parse(
        JSON.stringify({
          ideaResearchItemId: idea.id,
          ideaJourneyIndex: index,
          ideaSegments: journey.segments,
          origin: journey.origin,
          destination: journey.destination,
          departureDate: journey.departureDate,
          arrivalDate: journey.arrivalDate,
          departureTime: journey.departureTime,
          arrivalTime: journey.arrivalTime,
          serviceNumber: journey.serviceNumber,
        }),
      ),
      end_time: endTime,
      id: createId(),
      links: [],
      notes: value.note ?? null,
      place: null,
      place_id: null,
      price_amount: index === 0 ? (value.totalPriceAmount ?? null) : null,
      price_currency:
        index === 0 && value.totalPriceAmount !== null ? (value.currency ?? null) : null,
      schedule_kind: startTime ? (endTime ? "range" : "exact") : "none",
      schedule_text: null,
      sort_order: day.items.length,
      start_time: startTime,
      title: title.slice(0, 200),
      trip_id: draft.draftId,
      type,
      updated_at: timestamp,
      variant_id: draft.workspace.variant.id,
      version: 1,
    };
    day.items.push(item);
  }
  return {
    ...draft,
    trip: { ...draft.trip, day_count: count, start_date: start, end_date: end },
    workspace: { ...draft.workspace, days },
  };
}
