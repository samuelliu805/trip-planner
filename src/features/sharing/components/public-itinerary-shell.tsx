"use client";

import { CalendarDays, Map, PanelRightClose, PanelRightOpen, Route } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { canonicalPublicViews } from "../schema";
import type { PublicItinerary, PublicView } from "../types";
import { PublicItineraryViews } from "./public-itinerary-views";
import { PublicMapWorkspace, type PublicMapSelection } from "./public-map-workspace";
import { publicViewLabels } from "./public-share-settings";
import { PublicViewerShareDialog } from "./public-viewer-share-dialog";

function publicDateSummary(itinerary: PublicItinerary) {
  if (itinerary.trip.startDate && itinerary.trip.endDate) {
    const start = parseISO(itinerary.trip.startDate);
    const end = parseISO(itinerary.trip.endDate);
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")} · ${itinerary.trip.dayCount} days`;
  }
  return `${itinerary.trip.dayCount} ${itinerary.trip.dayCount === 1 ? "day" : "days"} · Dates not set`;
}

export function PublicItineraryShell({
  itinerary,
  publicUrl,
  token,
}: {
  itinerary: PublicItinerary;
  publicUrl: string;
  token: string;
}) {
  const [view, setView] = useState<PublicView>(itinerary.settings.defaultView);
  const [mapVisible, setMapVisible] = useState(itinerary.settings.showMapRoutes);
  const [mapSheetOpen, setMapSheetOpen] = useState(false);
  const [desktopMap, setDesktopMap] = useState(false);
  const [split, setSplit] = useState(64);
  const [selection, setSelection] = useState<PublicMapSelection>({});
  const shellRef = useRef<HTMLDivElement>(null);
  const showMap = itinerary.settings.showMapRoutes;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px) and (max-width: 1199px)");
    const setResponsiveSplit = () => setSplit(media.matches ? 56 : 64);
    setResponsiveSplit();
    media.addEventListener("change", setResponsiveSplit);
    return () => media.removeEventListener("change", setResponsiveSplit);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const setDesktop = () => setDesktopMap(media.matches);
    setDesktop();
    media.addEventListener("change", setDesktop);
    return () => media.removeEventListener("change", setDesktop);
  }, []);

  function switchView(nextView: PublicView) {
    if (nextView === view) return;
    setSelection({});
    setView(nextView);
  }

  function selectDay(dayRef: string) {
    setSelection((current) => ({
      dayRef,
      scope: current.dayRef === dayRef && !current.itemRef ? current.scope : undefined,
    }));
  }

  function selectItem(itemRef: string, dayRef: string) {
    setSelection((current) => ({
      dayRef,
      itemRef,
      scope: current.dayRef === dayRef && current.itemRef === itemRef ? current.scope : undefined,
    }));
  }

  function handleTabKey(event: React.KeyboardEvent<HTMLButtonElement>, current: PublicView) {
    const currentIndex = canonicalPublicViews.indexOf(current);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? canonicalPublicViews.length - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % canonicalPublicViews.length
            : event.key === "ArrowLeft"
              ? (currentIndex - 1 + canonicalPublicViews.length) % canonicalPublicViews.length
              : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextView = canonicalPublicViews[nextIndex];
    switchView(nextView);
    requestAnimationFrame(() => document.getElementById(`public-${nextView}-tab`)?.focus());
  }

  function resize(event: React.PointerEvent<HTMLDivElement>) {
    if (!shellRef.current || event.buttons !== 1) return;
    const bounds = shellRef.current.getBoundingClientRect();
    const next = ((event.clientX - bounds.left) / bounds.width) * 100;
    setSplit(Math.min(75, Math.max(52, Math.round(next))));
  }

  return (
    <main className="public-itinerary-shell isolate flex h-dvh min-w-0 flex-col overflow-hidden bg-background">
      <header className="public-itinerary-header sticky top-0 z-[80] shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="flex min-h-16 items-center justify-between gap-3 px-3 py-2 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              <Route aria-hidden="true" className="size-3.5" /> Trip Planner
            </div>
            <h1 className="mt-1 truncate text-base font-semibold sm:text-lg">
              {itinerary.trip.title}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
              {publicDateSummary(itinerary)} · {itinerary.variant.name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {showMap ? (
              <Button
                aria-label="Open map and routes"
                className="public-mobile-map-control hidden size-11 p-0"
                onClick={() => setMapSheetOpen(true)}
                type="button"
                variant="outline"
              >
                <Map aria-hidden="true" className="size-4" />
                <span className="sr-only">Map & routes</span>
              </Button>
            ) : null}
            {showMap ? (
              <Button
                aria-label={mapVisible ? "Collapse map and routes" : "Restore map and routes"}
                className="public-desktop-map-control min-h-11"
                onClick={() => setMapVisible((visible) => !visible)}
                type="button"
                variant="outline"
              >
                {mapVisible ? (
                  <PanelRightClose className="size-4" />
                ) : (
                  <PanelRightOpen className="size-4" />
                )}
                <span className="hidden lg:inline">
                  {mapVisible ? "Close map" : "Map & routes"}
                </span>
              </Button>
            ) : null}
            <PublicViewerShareDialog itinerary={itinerary} url={publicUrl} />
          </div>
        </div>
        <div className="flex items-end justify-between gap-3 px-3 sm:px-5">
          <div aria-label="Itinerary views" className="flex" role="tablist">
            {canonicalPublicViews.map((option) => (
              <button
                aria-controls={`public-${option}-panel`}
                aria-selected={view === option}
                className="relative min-h-11 px-3 text-sm font-medium text-muted-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-transparent hover:text-foreground aria-selected:text-foreground aria-selected:after:bg-primary sm:px-5"
                id={`public-${option}-tab`}
                key={option}
                onClick={() => switchView(option)}
                onKeyDown={(event) => handleTabKey(event, option)}
                role="tab"
                tabIndex={view === option ? 0 : -1}
                type="button"
              >
                {publicViewLabels[option]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div
        className={`public-itinerary-grid min-h-0 flex-1 ${mapVisible && showMap ? "has-map" : "map-collapsed"}`}
        ref={shellRef}
        style={
          {
            "--public-content-split": `${split}fr`,
            "--public-map-split": `${100 - split}fr`,
          } as React.CSSProperties
        }
      >
        <div className="public-content-pane min-h-0 min-w-0 overflow-hidden">
          <PublicItineraryViews
            itinerary={itinerary}
            onSelectDay={selectDay}
            onSelectItem={selectItem}
            selectedDayRef={selection.dayRef}
            selectedItemRef={selection.itemRef}
            view={view}
          />
        </div>
        {mapVisible && showMap && desktopMap ? (
          <>
            <div
              aria-label="Resize itinerary and map panes"
              aria-orientation="vertical"
              aria-valuemax={75}
              aria-valuemin={52}
              aria-valuenow={split}
              className="public-split-divider cursor-col-resize bg-border outline-none hover:bg-primary focus-visible:bg-primary"
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
                  event.preventDefault();
                if (event.key === "ArrowLeft") setSplit((value) => Math.max(52, value - 1));
                if (event.key === "ArrowRight") setSplit((value) => Math.min(75, value + 1));
                if (event.key === "Home") setSplit(52);
                if (event.key === "End") setSplit(75);
              }}
              onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
              onPointerMove={resize}
              role="separator"
              tabIndex={0}
            />
            <aside
              className="public-map-pane min-h-0 min-w-0 border-l"
              aria-label="Map and route workspace"
            >
              <PublicMapWorkspace
                activeView={view}
                itinerary={itinerary}
                onSelectionChange={setSelection}
                selectedDayRef={selection.dayRef}
                selectedItemRef={selection.itemRef}
                selectionScope={selection.scope}
                token={token}
              />
            </aside>
          </>
        ) : null}
      </div>

      {showMap ? (
        <Sheet onOpenChange={setMapSheetOpen} open={mapSheetOpen}>
          <SheetContent className="public-map-sheet h-[92dvh] max-h-[92dvh] p-0" side="bottom">
            <SheetHeader className="shrink-0">
              <SheetTitle>Map & routes</SheetTitle>
              <SheetDescription className="sr-only">
                Shared route first; route exploration stays temporary.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1">
              <PublicMapWorkspace
                activeView={view}
                itinerary={itinerary}
                onSelectionChange={setSelection}
                selectedDayRef={selection.dayRef}
                selectedItemRef={selection.itemRef}
                selectionScope={selection.scope}
                token={token}
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </main>
  );
}
