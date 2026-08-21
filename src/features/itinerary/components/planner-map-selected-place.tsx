"use client";

import { format, parseISO } from "date-fns";
import {
  Building2,
  CalendarDays,
  CarFront,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Hash,
  MapPin,
  Minus,
  Pencil,
  Plus,
  StickyNote,
  type LucideIcon,
  X,
} from "lucide-react";

import { deriveHotelStaySummary } from "@/features/itinerary/hotel-stay-summary";
import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";
import { mergeMarkerDateRanges } from "@/features/maps/marker-date-ranges";
import type { PlannerMapMarker } from "@/features/maps/planner-map-model";
import { formatMoney } from "@/features/research/money";
import { RouteIconButton } from "@/features/routes/route-icon-button";
import type { DayRouteUi } from "@/features/routes/use-day-route";

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

type CompactFact = { icon: LucideIcon; label: string; value: string };

function CompactFacts({ facts }: { facts: CompactFact[] }) {
  if (!facts.length) return null;
  return (
    <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
      {facts.map(({ icon: Icon, label, value }) => (
        <span
          aria-label={`${label}: ${value}`}
          className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs text-muted-foreground"
          key={`${label}-${value}`}
          title={`${label}: ${value}`}
        >
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate text-foreground">{value}</span>
        </span>
      ))}
    </div>
  );
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
  const details = itemDetails(item);
  const hotelStay = deriveHotelStaySummary(days, item);
  const firstStay = hotelStay?.ranges[0];
  const price =
    item?.price_amount !== null && item?.price_amount !== undefined && item.price_currency
      ? `${item.price_currency} ${formatMoney(item.price_amount, item.price_currency)}`
      : null;
  const dateRanges = mergeMarkerDateRanges(marker.entries);
  const dayCount = new Set(marker.entries.map(({ dayNumber }) => dayNumber)).size;
  const dayValue =
    entry.kind === "city"
      ? dateRanges
      : firstStay?.checkInDate && firstStay.checkOutDate
        ? stayRangeLabel(firstStay.checkInDate, firstStay.checkOutDate)
        : entry.dayLabel;
  const time = timeLabel(item);
  const facts: CompactFact[] = [
    dayValue && { icon: CalendarDays, label: "Date", value: dayValue },
    time && { icon: Clock3, label: "Time", value: time },
    price && { icon: CircleDollarSign, label: "Price", value: price },
    details.serviceNumber && { icon: Hash, label: "Service", value: details.serviceNumber },
    details.provider && { icon: Building2, label: "Provider", value: details.provider },
    details.action && {
      icon: CarFront,
      label: "Rental",
      value: details.action === "pickup" ? "Pick-up" : "Return",
    },
  ].filter((fact): fact is CompactFact => Boolean(fact));
  const links = item?.links?.length
    ? item.links.map(({ id, label, url }) => ({ id, label, url }))
    : item?.booking_url
      ? [{ id: item.id, label: "Booking", url: item.booking_url }]
      : [];
  const eligibleDayStop = ["activity", "hotel", "meal"].includes(entry.kind);
  const repeatedLabel =
    entry.kind === "city"
      ? `${dayCount} ${dayCount === 1 ? "day" : "days"} in this city`
      : entry.kind === "hotel"
        ? `${hotelStay?.totalDays ?? dayCount} ${(hotelStay?.totalDays ?? dayCount) === 1 ? "day" : "days"}`
        : entry.kind === "carRental"
          ? `${marker.entries.length} rental events`
          : `${marker.entries.length} ${entry.kind === "meal" ? "meals" : "activities"}`;

  return (
    <article aria-live="polite" className="min-w-0">
      <div className="flex min-w-0 items-start gap-2">
        <MapPin aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold leading-tight">{entry.title}</h3>
          {marker.address ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
              {marker.address}
            </p>
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

      <CompactFacts facts={facts} />
      {marker.summary ? (
        <p className="mt-2 text-xs font-medium text-muted-foreground">{marker.summary}</p>
      ) : null}

      {marker.entries.length > 1 ? (
        <details className="group mt-2 border-t pt-2">
          <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium marker:content-none">
            <span>{repeatedLabel}</span>
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-1 max-h-32 overflow-y-auto rounded-md border">
            {marker.entries.map((candidate) => (
              <button
                aria-current={candidate.itemId === selectedId ? "true" : undefined}
                className={`grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-2.5 text-left text-xs last:border-b-0 ${candidate.itemId === selectedId ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}
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
      ) : null}

      {item?.notes || links.length ? (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 border-t pt-2">
          {item?.notes ? (
            <p className="flex min-w-0 flex-1 items-start gap-2 text-xs leading-4 text-muted-foreground">
              <StickyNote aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span className="line-clamp-2 whitespace-pre-wrap text-foreground" title={item.notes}>
                {item.notes}
              </span>
            </p>
          ) : (
            <span className="flex-1" />
          )}
          {links.map((link) => (
            <a
              aria-label={`Open ${link.label}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-background hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={link.url}
              key={link.id}
              rel="noopener noreferrer"
              target="_blank"
              title={link.label}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}
