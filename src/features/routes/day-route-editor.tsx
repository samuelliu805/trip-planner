"use client";

import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  ChevronDown,
  Footprints,
  MapPin,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  Utensils,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PullUpPanelHandle } from "@/components/ui/pull-up-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { transportModeLabels, type ItineraryItem } from "@/features/itinerary/types";

import { DayRouteStatusBadge, SelectedPlaceSlot } from "./day-route-panel-ui";
import { RouteIconButton } from "./route-icon-button";
import { routeLegModes, type RouteLegMode } from "./types";
import type { DayRouteUi } from "./use-day-route";

function StopIcon({ item }: { item?: ItineraryItem }) {
  if (item?.type === "hotel") return <BedDouble className="size-4" />;
  if (item?.type === "meal") return <Utensils className="size-4" />;
  return <MapPin className="size-4" />;
}

export function DayRouteEditor({
  onBack,
  route,
  selectedPlace,
}: {
  onBack: () => void;
  route: DayRouteUi;
  selectedPlace?: React.ReactNode;
}) {
  const [unplannedOpen, setUnplannedOpen] = useState(true);
  const draft = route.draft!;
  const itemsById = new Map(route.stopItems.map((item) => [item.id, item]));
  const planned = new Set(draft.itemIds);
  const unplanned = route.eligibleItems.filter(({ id }) => !planned.has(id));

  return (
    <section
      aria-label="Edit Route A"
      className="day-route-editor mobile-pull-up-panel absolute inset-x-3 bottom-3 z-30 flex max-h-[62dvh] flex-col overflow-hidden overscroll-none rounded-xl border bg-background/97 shadow-xl backdrop-blur min-[900px]:left-auto min-[900px]:right-3 min-[900px]:top-14 min-[900px]:max-h-none min-[900px]:w-[min(360px,calc(100%-1.5rem))]"
    >
      <PullUpPanelHandle className="sm:hidden" onClose={onBack} />
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Day {route.activeDay?.day_number} · Route A</p>
            <p className="text-xs text-muted-foreground">Manual order is used.</p>
          </div>
          <div className="flex items-center gap-2">
            <DayRouteStatusBadge route={route} />
            <RouteIconButton
              label="Discard changes and collapse route editor"
              onClick={onBack}
              title="Discard changes and return to route summary"
            >
              <ChevronDown className="size-4" />
            </RouteIconButton>
          </div>
        </div>
      </header>
      <SelectedPlaceSlot>{selectedPlace}</SelectedPlaceSlot>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {draft.itemIds.length ? (
          <ol className="space-y-2" aria-label="Planned stops">
            {draft.itemIds.map((itemId, index) => {
              const item = itemsById.get(itemId);
              const itemDay =
                item?.day_id === route.previousDay?.id ? route.previousDay : route.activeDay;
              const previousHotelStart =
                itemsById.get(draft.itemIds[0])?.day_id === route.previousDay?.id;
              const time = item?.start_time?.slice(0, 5);
              return (
                <li key={`${itemId}:${index}`}>
                  <div className="flex min-h-11 items-center gap-2 rounded-lg border bg-background px-2 py-1.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <span className="text-muted-foreground">
                      <StopIcon item={item} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {item?.title ?? "Deleted item"}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {itemDay ? `Day ${itemDay.day_number} · ` : ""}
                        {time ? `${time} · ` : ""}
                        {item?.place ? item.place.displayName : "Saved place missing"}
                      </span>
                    </span>
                    <RouteIconButton
                      disabled={index === 0 || (index === 1 && previousHotelStart) || route.pending}
                      label={`Move stop ${index + 1} up`}
                      onClick={() => route.moveStop(index, -1)}
                      title="Move stop up"
                    >
                      <ArrowUp className="size-4" />
                    </RouteIconButton>
                    <RouteIconButton
                      disabled={
                        index === draft.itemIds.length - 1 ||
                        (index === 0 && previousHotelStart) ||
                        route.pending
                      }
                      label={`Move stop ${index + 1} down`}
                      onClick={() => route.moveStop(index, 1)}
                      title="Move stop down"
                    >
                      <ArrowDown className="size-4" />
                    </RouteIconButton>
                    <RouteIconButton
                      disabled={route.pending}
                      label={`Remove stop ${index + 1}`}
                      onClick={() => route.removeStop(index)}
                      title="Remove stop"
                      variant="destructive"
                    >
                      <Trash2 className="size-4" />
                    </RouteIconButton>
                  </div>
                  {index < draft.legModes.length ? (
                    <div className="ml-4 flex min-h-12 items-center gap-2 border-l-2 border-dashed border-primary/30 pl-4">
                      <Footprints className="size-4 shrink-0 text-primary" />
                      <Select
                        disabled={route.pending}
                        onValueChange={(value) => route.setLegMode(index, value as RouteLegMode)}
                        value={draft.legModes[index]}
                      >
                        <SelectTrigger
                          aria-label={`Travel mode for leg ${index + 1}`}
                          className="h-10"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {routeLegModes.map((mode) => (
                            <SelectItem key={mode} value={mode}>
                              {transportModeLabels[mode]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Add stops from Unplanned places or select a gray Pin on the map.
          </div>
        )}

        <Button
          aria-busy={route.pending}
          className="mt-3 w-full"
          disabled={route.pending || !route.hotelTransferAvailable}
          onClick={route.useHotelRoundTrip}
          size="sm"
          title={
            route.hotelTransferAvailable
              ? "Start at the previous day's Hotel and end at today's Hotel"
              : "Add a place-linked Hotel to both the previous day and this day"
          }
          type="button"
          variant="outline"
        >
          <BedDouble className="size-4" />
          Use Hotels as start &amp; end
        </Button>
        {!route.hotelTransferAvailable ? (
          <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
            Requires a place-linked Hotel on both the previous day and this day.
          </p>
        ) : null}

        <div className="mt-3 overflow-hidden rounded-lg border">
          <button
            aria-expanded={unplannedOpen}
            className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-xs font-semibold hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => setUnplannedOpen((open) => !open)}
            type="button"
          >
            <span>Unplanned places ({unplanned.length})</span>
            <ChevronDown
              aria-hidden="true"
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${unplannedOpen ? "rotate-180" : ""}`}
            />
          </button>
          {unplannedOpen ? (
            <div className="border-t p-2">
              {unplanned.length ? (
                <ul className="space-y-1">
                  {unplanned.map((item) => (
                    <li className="flex min-h-11 items-center gap-2" key={item.id}>
                      <span className="text-muted-foreground">
                        <StopIcon item={item} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs">{item.title}</span>
                      <RouteIconButton
                        disabled={route.pending}
                        label={`Add ${item.title} to route`}
                        onClick={() => route.addStop(item.id)}
                        title="Add to route"
                        variant="secondary"
                      >
                        <Plus className="size-4" />
                      </RouteIconButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-2 text-xs text-muted-foreground">
                  All eligible places are planned.
                </p>
              )}
            </div>
          ) : null}
        </div>

        {route.error ? (
          <p
            className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive"
            role="alert"
          >
            {route.error}
          </p>
        ) : null}
      </div>
      <footer className="flex items-center gap-2 border-t p-3">
        {route.plan ? (
          <RouteIconButton
            disabled={route.pending}
            label="Clear saved route"
            onClick={() => {
              if (window.confirm("Clear this saved day route and its calculation?"))
                void route.clearRoute();
            }}
            variant="destructive"
          >
            <Trash2 className="size-4" />
          </RouteIconButton>
        ) : null}
        <Button
          className="ml-auto"
          disabled={draft.itemIds.length < 2 || route.pending}
          onClick={() => void route.saveAndCalculate()}
          size="sm"
          type="button"
        >
          {route.pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {route.pending ? "Saving…" : "Save & calculate"}
        </Button>
      </footer>
    </section>
  );
}
