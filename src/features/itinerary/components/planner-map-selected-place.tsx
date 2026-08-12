"use client";

import { format, parseISO } from "date-fns";
import { ChevronDown, ExternalLink, Minus, Pencil, Plus, X } from "lucide-react";

import { deriveHotelStaySummary } from "@/features/itinerary/hotel-stay-summary";
import { mergeMarkerDateRanges } from "@/features/maps/marker-date-ranges";
import type { PlannerMapMarker } from "@/features/maps/planner-map-model";
import { RouteIconButton } from "@/features/routes/route-icon-button";
import type { DayRouteUi } from "@/features/routes/use-day-route";
import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";
import { formatMoney } from "@/features/research/money";

function itemDetails(item?: ItineraryItem) {
  return item?.details && typeof item.details === "object" && !Array.isArray(item.details)
    ? (item.details as Record<string, string | undefined>)
    : {};
}

function timeLabel(item?: ItineraryItem) {
  if (!item?.start_time) return null;
  const start = item.start_time.slice(0, 5);
  return item.end_time ? `${start}–${item.end_time.slice(0, 5)}` : start;
}

function stayRangeLabel(checkInDate: string, checkOutDate: string) {
  const checkIn = parseISO(checkInDate);
  const checkOut = parseISO(checkOutDate);
  const sameYear = checkIn.getFullYear() === checkOut.getFullYear();
  return `${format(checkIn, sameYear ? "MMM d" : "MMM d, yyyy")} → ${format(checkOut, "MMM d, yyyy")}`;
}

export function PlannerMapSelectedPlace({
  dayRoute,
  days,
  item,
  mapMode,
  marker,
  onClose,
  onEditMapItem,
  onMarkerClick,
  selectedId,
}: {
  dayRoute: DayRouteUi;
  days: PlannerDay[];
  item?: ItineraryItem;
  mapMode: "overview" | "day_route";
  marker: PlannerMapMarker;
  onClose: () => void;
  onEditMapItem: (itemId: string) => void;
  onMarkerClick: (id?: string) => void;
  selectedId: string;
}) {
  const entry = marker.entries.find(({ itemId }) => itemId === selectedId);
  if (!entry) return null;
  const dayCount = new Set(marker.entries.map(({ dayNumber }) => dayNumber)).size;
  const dateRanges = mergeMarkerDateRanges(marker.entries);
  const hotelStay = deriveHotelStaySummary(days, item);
  const staySummary =
    entry.kind === "hotel"
      ? `Total ${hotelStay?.totalDays ?? dayCount} ${(hotelStay?.totalDays ?? dayCount) === 1 ? "day" : "days"} at this hotel`
      : entry.kind === "city"
        ? `Total ${dayCount} ${dayCount === 1 ? "day" : "days"} in this city`
        : null;
  const eventSummary =
    entry.kind === "activity"
      ? `${marker.entries.length} ${marker.entries.length === 1 ? "activity" : "activities"} here`
      : entry.kind === "meal"
        ? `${marker.entries.length} ${marker.entries.length === 1 ? "meal" : "meals"} here`
        : `${marker.entries.length} car rental ${marker.entries.length === 1 ? "event" : "events"} here`;
  const eligibleDayStop = ["activity", "hotel", "meal"].includes(entry.kind);
  const details = itemDetails(item);
  const time = timeLabel(item);
  const price =
    item?.price_amount !== null && item?.price_amount !== undefined && item.price_currency
      ? `${item.price_currency} ${formatMoney(item.price_amount, item.price_currency)}`
      : null;
  const bookingLinks = item?.links?.length
    ? item.links.map(({ id, label, url }) => ({ id, label, url }))
    : item?.booking_url
      ? [{ id: item.id, label: "Booking", url: item.booking_url }]
      : [];
  const facts = [
    time && { label: "Time", value: time },
    price && { label: "Price", value: price },
    details.serviceNumber && { label: "Service", value: details.serviceNumber },
    details.action && {
      label: "Rental",
      value: details.action === "pickup" ? "Pick-up" : "Return",
    },
    details.provider && { label: "Provider", value: details.provider },
    entry.kind !== "hotel" &&
      details.checkInDate && { label: "Check-in", value: details.checkInDate },
    entry.kind !== "hotel" &&
      details.checkOutDate && { label: "Check-out", value: details.checkOutDate },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));

  return (
    <div aria-live="polite">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{entry.title}</p>
          {marker.address ? (
            <p className="truncate text-xs text-muted-foreground">{marker.address}</p>
          ) : null}
        </div>
        <RouteIconButton
          label={`Edit ${entry.title}`}
          onClick={() => onEditMapItem(entry.itemId)}
          title="Edit item"
        >
          <Pencil className="size-4" />
        </RouteIconButton>
        <RouteIconButton label="Close place details" onClick={onClose} title="Close place details">
          <X className="size-4" />
        </RouteIconButton>
        {mapMode === "day_route" && eligibleDayStop && dayRoute.editing ? (
          dayRoute.draft?.itemIds.includes(entry.itemId) ? (
            <RouteIconButton
              label={`Remove ${entry.title} from route`}
              onClick={() => dayRoute.removeItem(entry.itemId)}
              title="Remove from route"
              variant="destructive"
            >
              <Minus className="size-4" />
            </RouteIconButton>
          ) : (
            <RouteIconButton
              label={`Add ${entry.title} to route`}
              onClick={() => dayRoute.addStop(entry.itemId)}
              title="Add to route"
              variant="secondary"
            >
              <Plus className="size-4" />
            </RouteIconButton>
          )
        ) : null}
      </div>
      {marker.summary ? (
        <p className="mt-1 text-xs font-medium">{marker.summary}</p>
      ) : staySummary ? (
        <p className="mt-1 text-xs">
          <span className="font-medium">{staySummary}</span>
          {entry.kind === "city" ? (
            <span className="text-muted-foreground"> · {dateRanges}</span>
          ) : null}
        </p>
      ) : marker.entries.length === 1 ? (
        <p className="mt-1 text-xs text-muted-foreground">{entry.dayLabel}</p>
      ) : (
        <details className="group mt-2 border-t pt-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium marker:content-none">
            <span>{eventSummary}</span>
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 max-h-36 overflow-y-auto rounded-md border bg-background/80">
            {marker.entries.map((candidate) => (
              <button
                aria-current={candidate.itemId === selectedId ? "true" : undefined}
                className={`grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-2.5 py-1.5 text-left text-xs last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${candidate.itemId === selectedId ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}
                key={candidate.itemId}
                onClick={() => onMarkerClick(candidate.itemId)}
                type="button"
              >
                <span className="truncate">{candidate.title}</span>
                <span className="text-muted-foreground">{candidate.dayLabel}</span>
              </button>
            ))}
          </div>
        </details>
      )}
      {entry.kind === "hotel" && hotelStay?.ranges.length ? (
        <div className="mt-2 space-y-1.5 border-t pt-2" aria-label="Hotel booking dates">
          {hotelStay.ranges.map((range, index) => (
            <div
              className="flex items-center justify-between gap-3 text-xs"
              key={`${range.checkInDate ?? range.firstDayNumber}-${range.checkOutDate ?? range.lastDayNumber}`}
            >
              <span className="text-muted-foreground">
                {range.checkInDate && range.checkOutDate
                  ? stayRangeLabel(range.checkInDate, range.checkOutDate)
                  : range.firstDayNumber === range.lastDayNumber
                    ? `Day ${range.firstDayNumber}`
                    : `Day ${range.firstDayNumber} → Day ${range.lastDayNumber + 1}`}
              </span>
              <span className="shrink-0 font-medium">
                {range.dayCount} {range.dayCount === 1 ? "day" : "days"}
              </span>
              <span className="sr-only">Stay {index + 1}</span>
            </div>
          ))}
        </div>
      ) : null}
      {facts.length || item?.notes || bookingLinks.length ? (
        <div className="mt-3 space-y-3 border-t pt-3">
          {facts.length ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              {facts.map((fact) => (
                <div className="min-w-0" key={fact.label}>
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {fact.label}
                  </dt>
                  <dd className="truncate font-medium" title={fact.value}>
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {item?.notes ? (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5">{item.notes}</p>
            </div>
          ) : null}
          {bookingLinks.length ? (
            <div className="flex flex-wrap gap-2">
              {bookingLinks.map((link) => (
                <a
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={link.url}
                  key={link.id}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {link.label} <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
