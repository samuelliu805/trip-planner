import type { ItineraryItem, PlannerDay, PlannerWorkspace } from "../itinerary/types";
import { optimisticSavedItem } from "../itinerary/sync-operation.ts";
import type { ResearchItem } from "./types";
import { ideaJourneyPreview } from "./idea-journey-preview.ts";
import { addIsoDateDays } from "./date-range.ts";
import { applicationCalendar } from "./application-calendar.ts";
import { sourceSnapshot } from "../variants/source-snapshot.ts";
import { projectApplication } from "./project-application.ts";
export { projectApplication } from "./project-application.ts";

export type ApplicationProjection = {
  confirmed?: true;
  baseDaysVersion?: number;
  days: PlannerDay[];
  items: ItineraryItem[];
  removedIds: string[];
  removedDayIds?: string[];
  previewSnapshot?: string;
  bindings: Array<{
    id: string;
    sourceId: string;
    index: number;
    date: string | null;
    action?: string;
  }>;
};

/** This is a pending preview. Only an authenticated receipt can turn it into confirmed rows. */
export function captureApplicationProjection(
  workspace: PlannerWorkspace,
  sources: ResearchItem[],
  options: {
    booking?: boolean;
    dayId?: string | null;
    beforeItemId?: string | null;
    anchor?: number | null;
    targetId?: string;
    keepExtraDays?: boolean;
  },
): ApplicationProjection {
  const days = workspace.days.map((day) => ({ ...day, items: [...day.items] }));
  const projected: ApplicationProjection = {
    days: [],
    items: [],
    removedIds: [],
    bindings: [],
    baseDaysVersion: workspace.variant.days_version,
  };
  const ensureDay = (date: string | null, fallback?: string | null) => {
    let day = fallback
      ? days.find((day) => day.id === fallback)
      : days.find((day) => date && day.date === date);
    if (!day && date) {
      day = {
        ...days[0],
        id: crypto.randomUUID(),
        day_number: days.length + 1,
        date,
        title: null,
        notes: null,
        version: 1,
        content_version: 1,
        items_version: 1,
        items: [],
      };
      days.push(day);
    }
    return day ?? days[0];
  };
  for (const source of sources) {
    projected.removedDayIds = [
      ...(projected.removedDayIds ?? []),
      ...applicationCalendar(days, source, workspace, options),
    ];
    const journeys = ideaJourneyPreview(source);
    if (!journeys.length && (source.category === "flight" || source.category === "train"))
      journeys.push({
        origin: source.origin_text ?? "",
        destination: source.destination_text ?? "",
        departureDate: source.start_date ?? "",
        arrivalDate: source.end_date ?? source.start_date ?? "",
        departureTime: source.start_time ?? undefined,
        arrivalTime: source.end_time ?? undefined,
        serviceNumber: "",
        missingTimes: !source.start_time || !source.end_time,
      });
    let events: Array<{
      date: string | null;
      title: string;
      details: Record<string, unknown>;
      start?: string | null;
      end?: string | null;
    }>;
    if (journeys.length)
      events = journeys.map((journey, index) => {
        return {
          date: journey.departureDate || source.start_date,
          title:
            journeys.length > 1
              ? `${journey.origin} → ${journey.destination}`
              : (source.title ?? `${journey.origin} → ${journey.destination}`),
          start: journey.departureTime ?? source.start_time,
          end:
            journey.arrivalDate === journey.departureDate
              ? (journey.arrivalTime ?? source.end_time)
              : null,
          details: {
            origin: journey.origin,
            destination: journey.destination,
            departureDate: journey.departureDate,
            arrivalDate: journey.arrivalDate,
            departureTime: journey.departureTime,
            arrivalTime: journey.arrivalTime,
            serviceNumber: journey.serviceNumber,
            ...(options.booking
              ? { mode: source.category, segmentIndex: index }
              : { ideaJourneyIndex: index }),
          },
        };
      });
    else if (
      options.booking &&
      source.category === "stay" &&
      source.start_date &&
      source.end_date
    ) {
      events = [];
      for (
        let date = source.start_date;
        date < source.end_date && events.length < 366;
        date = addIsoDateDays(date, 1)!
      )
        events.push({
          date,
          title: source.title ?? source.location_text ?? "",
          details: {
            address: source.location_text,
            checkInDate: source.start_date,
            checkOutDate: source.end_date,
          },
        });
    } else if (options.booking && source.category === "rental")
      events = [
        {
          date: source.start_date,
          title: source.title ?? "",
          start: source.start_time,
          details: { action: "pickup", address: source.origin_text, provider: source.title },
        },
        {
          date: source.end_date,
          title: source.title ?? "",
          start: source.end_time,
          details: {
            action: "return",
            address: source.destination_text ?? source.origin_text,
            provider: source.title,
          },
        },
      ];
    else
      events = [
        {
          date: source.start_date,
          title: source.title ?? source.location_text ?? "",
          start: source.start_time,
          end: source.end_time,
          details: { location: source.location_text },
        },
      ];
    events.forEach((event, index) => {
      const day = ensureDay(
        event.date,
        !options.booking && !journeys.length ? options.dayId : null,
      );
      if (!day) return;
      const type: ItineraryItem["type"] =
        source.category === "stay"
          ? "hotel"
          : source.category === "rental"
            ? "car_rental"
            : source.category === "flight"
              ? "flight"
              : source.category === "train"
                ? "train"
                : "activity";
      const candidates = day.items.filter(
        (item) =>
          (item.type === type ||
            (item.type === "transport" &&
              (item.details as Record<string, unknown>)?.mode === type)) &&
          (type !== "car_rental" ||
            (item.details as Record<string, unknown>)?.action === event.details.action),
      );
      const existing = options.booking
        ? (day.items.find((item) => index === 0 && item.id === options.targetId) ??
          (candidates.length === 1 ? candidates[0] : undefined))
        : undefined;
      if (!options.booking && type === "hotel")
        projected.removedIds.push(...candidates.map((item) => item.id));
      const id = existing?.id ?? crypto.randomUUID();
      const details = JSON.parse(
        JSON.stringify({
          ...((existing?.details as object) ?? {}),
          ...event.details,
          ...(options.booking
            ? { researchSourceId: source.id }
            : { ideaResearchItemId: source.id, ideaJourneyIndex: index }),
        }),
      );
      const item = optimisticSavedItem(
        {
          operationId: id,
          tripId: workspace.variant.trip_id,
          variantId: workspace.variant.id,
          dayId: day.id,
          type: existing?.type ?? type,
          title: event.title,
          details,
          startTime: event.start,
          endTime: event.end,
          notes: source.note,
          bookingUrl: source.source_url,
          priceAmount: index === 0 ? source.total_price_amount : null,
          priceCurrency: source.currency,
          placeId: source.location_place_id,
          expectedItemsVersion: day.items_version,
        },
        existing,
      );
      const before = day.items.find((item) => item.id === options.beforeItemId);
      item.sort_order =
        existing?.sort_order ??
        (before ? before.sort_order - 0.5 : undefined) ??
        (day.items.find((item) => item.type === "hotel")?.sort_order !== undefined
          ? day.items.find((item) => item.type === "hotel")!.sort_order - 0.5
          : undefined) ??
        Math.max(-1, ...day.items.map((item) => item.sort_order)) + 1;
      projected.items.push(item);
      projected.bindings.push({
        id,
        sourceId: source.id,
        index,
        date: day.date,
        action: String(details.action ?? ""),
      });
    });
  }
  projected.days = days.map((day) => ({ ...day, items: [] }));
  projected.previewSnapshot = sourceSnapshot(projectApplication(workspace, projected));
  return projected;
}
