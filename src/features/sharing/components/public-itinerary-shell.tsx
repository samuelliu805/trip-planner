"use client";

import { CalendarDays, Map, PanelRightClose, PanelRightOpen, Route } from "lucide-react";
import { format, parseISO } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { PublicTemplate } from "../public-url-state";
import type { PublicItinerary, PublicView } from "../types";
import { PublicItineraryViews } from "./public-itinerary-views";
import { PublicMapWorkspace, type PublicMapSelection } from "./public-map-workspace";
import { PublicViewSwitcher } from "./public-view-switcher";
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
  initialTemplate,
  initialView,
  itinerary,
  publicUrl,
  token,
}: {
  initialTemplate: PublicTemplate;
  initialView: PublicView;
  itinerary: PublicItinerary;
  publicUrl: string;
  token: string;
}) {
  const [view, setView] = useState<PublicView>(initialView);
  const [mapVisible, setMapVisible] = useState(itinerary.settings.showMapRoutes);
  const [mapSheetOpen, setMapSheetOpen] = useState(false);
  const [desktopMap, setDesktopMap] = useState(false);
  const [split, setSplit] = useState(64);
  const [selection, setSelection] = useState<PublicMapSelection>({});
  const shellRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showMap = itinerary.settings.showMapRoutes;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px) and (max-width: 1199px)");
    const setResponsiveSplit = () => setSplit(media.matches ? 56 : 64);
    setResponsiveSplit();
    media.addEventListener("change", setResponsiveSplit);
    return () => media.removeEventListener("change", setResponsiveSplit);
  }, []);

  useEffect(() => {
    if (
      searchParams.get("template") === initialTemplate &&
      searchParams.get("view") === initialView
    )
      return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("template", initialTemplate);
    nextParams.set("view", initialView);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [initialTemplate, initialView, pathname, router, searchParams]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const setDesktop = () => setDesktopMap(media.matches);
    setDesktop();
    media.addEventListener("change", setDesktop);
    return () => media.removeEventListener("change", setDesktop);
  }, []);

  function switchView(nextView: PublicView) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("template", initialTemplate);
    nextParams.set("view", nextView);
    if (nextView !== view) {
      setSelection({});
      setView(nextView);
    }
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
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

  function resize(event: React.PointerEvent<HTMLDivElement>) {
    if (!shellRef.current || event.buttons !== 1) return;
    const bounds = shellRef.current.getBoundingClientRect();
    const next = ((event.clientX - bounds.left) / bounds.width) * 100;
    setSplit(Math.min(75, Math.max(52, Math.round(next))));
  }

  const shareUrl = new URL(publicUrl);
  shareUrl.searchParams.set("template", initialTemplate);
  shareUrl.searchParams.set("view", view);

  return (
    <main
      className={`public-itinerary-shell public-template-${initialTemplate} isolate flex h-dvh min-w-0 flex-col overflow-hidden bg-background`}
      data-public-template={initialTemplate}
    >
      <header className="public-itinerary-header">
        <div className="public-header-row">
          <div className="public-brand-area">
            <div className="public-brand-kicker">
              <Route aria-hidden="true" className="size-3.5" /> Trip Planner
            </div>
            <h1 className="public-trip-title">{itinerary.trip.title}</h1>
            <p className="public-trip-meta">
              <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
              {publicDateSummary(itinerary)} · {itinerary.variant.name}
            </p>
          </div>
          <div className="public-header-actions">
            {showMap ? (
              <Button
                aria-label={mapVisible ? "Collapse map and routes" : "Restore map and routes"}
                className="public-desktop-map-control public-header-button"
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
            <PublicViewerShareDialog
              itinerary={itinerary}
              template={initialTemplate}
              url={shareUrl.toString()}
            />
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
          <PublicViewSwitcher onChange={switchView} value={view} />
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
                template={initialTemplate}
                token={token}
              />
            </aside>
          </>
        ) : null}
      </div>

      {showMap ? (
        <Button
          aria-label="Open map and routes"
          className="public-mobile-map-control"
          onClick={() => setMapSheetOpen(true)}
          type="button"
        >
          <Map aria-hidden="true" className="size-4" />
          <span>Map & routes</span>
        </Button>
      ) : null}

      {showMap ? (
        <Sheet onOpenChange={setMapSheetOpen} open={mapSheetOpen}>
          <SheetContent
            className={`public-map-sheet public-share-surface public-template-${initialTemplate} h-[92dvh] max-h-[92dvh] p-0`}
            side="bottom"
          >
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
                template={initialTemplate}
                token={token}
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </main>
  );
}
