"use client";

import { ChevronDown, Minus, Pencil, Plus } from "lucide-react";

import { mergeMarkerDateRanges } from "@/features/maps/marker-date-ranges";
import type { PlannerMapMarker } from "@/features/maps/planner-map-model";
import { RouteIconButton } from "@/features/routes/route-icon-button";
import type { DayRouteUi } from "@/features/routes/use-day-route";

export function PlannerMapSelectedPlace({
  dayRoute,
  mapMode,
  marker,
  onEditMapItem,
  onMarkerClick,
  selectedId,
}: {
  dayRoute: DayRouteUi;
  mapMode: "overview" | "day_route";
  marker: PlannerMapMarker;
  onEditMapItem: (itemId: string) => void;
  onMarkerClick: (id?: string) => void;
  selectedId: string;
}) {
  const entry = marker.entries.find(({ itemId }) => itemId === selectedId);
  if (!entry) return null;
  const dayCount = new Set(marker.entries.map(({ dayNumber }) => dayNumber)).size;
  const dateRanges = mergeMarkerDateRanges(marker.entries);
  const staySummary =
    entry.kind === "hotel"
      ? `Total ${dayCount} ${dayCount === 1 ? "day" : "days"} at this hotel`
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
          <span className="text-muted-foreground"> · {dateRanges}</span>
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
    </div>
  );
}
