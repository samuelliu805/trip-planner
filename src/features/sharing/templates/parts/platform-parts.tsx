"use client";

import { Map, PanelRightClose, PanelRightOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import {
  PublicItineraryViewPanel,
  PublicItineraryViews,
} from "../../components/public-itinerary-views";
import { PublicMapWorkspace } from "../../components/public-map-workspace";
import { PublicTripHeader } from "../../components/public-trip-header";
import { PublicViewSwitcher } from "../../components/public-view-switcher";
import { PublicViewerShareDialog } from "../../components/public-viewer-share-dialog";
import type { PublicTemplatePartId } from "../schema";
import { usePublicTemplateController } from "../runtime/controller";

function TripHeaderPart() {
  const { itinerary, template } = usePublicTemplateController();
  return <PublicTripHeader itinerary={itinerary} template={template} />;
}

function DesktopMapTogglePart() {
  const { mapVisible, setMapVisible, showMap } = usePublicTemplateController();
  if (!showMap) return null;
  return (
    <Button
      aria-label={mapVisible ? "Collapse map and routes" : "Restore map and routes"}
      className="public-desktop-map-control public-header-button"
      onClick={() => setMapVisible((visible) => !visible)}
      type="button"
      variant="outline"
    >
      {mapVisible ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
      <span className="hidden lg:inline">{mapVisible ? "Close map" : "Map & routes"}</span>
    </Button>
  );
}

function ViewerShareDialogPart() {
  const { itinerary, ownerImageState, ownerSharePage, shareImage, shareUrl, template } =
    usePublicTemplateController();
  return (
    <PublicViewerShareDialog
      itinerary={itinerary}
      ownerImageState={ownerImageState}
      ownerSharePage={ownerSharePage}
      shareImage={shareImage}
      template={template}
      url={shareUrl}
    />
  );
}

function ActiveViewPart() {
  const { itinerary, selectDay, selectItem, selection, view } = usePublicTemplateController();
  return (
    <PublicItineraryViews
      itinerary={itinerary}
      onSelectDay={selectDay}
      onSelectItem={selectItem}
      selectedDayRef={selection.dayRef}
      selectedItemRef={selection.itemRef}
      view={view}
    />
  );
}

function ViewSwitcherPart() {
  const { switchView, view } = usePublicTemplateController();
  return <PublicViewSwitcher onChange={switchView} value={view} />;
}

function PublicViewPart({ option }: { option: "overview" | "table" | "timeline" }) {
  const { itinerary, selectDay, selectItem, selection, view } = usePublicTemplateController();
  return (
    <PublicItineraryViewPanel
      itinerary={itinerary}
      onSelectDay={selectDay}
      onSelectItem={selectItem}
      option={option}
      selectedDayRef={selection.dayRef}
      selectedItemRef={selection.itemRef}
      view={view}
    />
  );
}

function MapWorkspacePart() {
  const controller = usePublicTemplateController();
  const { desktopMap, mapVisible, resize, setSplit, showMap, split } = controller;
  if (!mapVisible || !showMap || !desktopMap) return null;
  return (
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
        <PlatformMapWorkspace />
      </aside>
    </>
  );
}

function PlatformMapWorkspace() {
  const { itinerary, onSelectionChange, selection, template, token, view } =
    usePublicTemplateController();
  return (
    <PublicMapWorkspace
      activeView={view}
      itinerary={itinerary}
      onSelectionChange={onSelectionChange}
      selectedDayRef={selection.dayRef}
      selectedItemRef={selection.itemRef}
      selectionScope={selection.scope}
      templateId={template.id}
      token={token}
    />
  );
}

function MobileMapTriggerPart() {
  const { setMapSheetOpen, showMap } = usePublicTemplateController();
  if (!showMap) return null;
  return (
    <Button
      aria-label="Open map and routes"
      className="public-mobile-map-control"
      onClick={() => setMapSheetOpen(true)}
      type="button"
    >
      <Map aria-hidden="true" className="size-4" />
      <span>Map & routes</span>
    </Button>
  );
}

function MobileMapSheetPart() {
  const { mapSheetOpen, setMapSheetOpen, showMap, template } = usePublicTemplateController();
  if (!showMap) return null;
  return (
    <Sheet onOpenChange={setMapSheetOpen} open={mapSheetOpen}>
      <SheetContent
        className={`public-map-sheet public-share-surface public-template-${template.id} h-[92dvh] max-h-[92dvh] p-0`}
        data-public-template-key={template.key}
        side="bottom"
      >
        <SheetHeader className="shrink-0">
          <SheetTitle>Map & routes</SheetTitle>
          <SheetDescription className="sr-only">
            Shared route first; route exploration stays temporary.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <PlatformMapWorkspace />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const publicTemplatePlatformParts = {
  "active-view": ActiveViewPart,
  "desktop-map-toggle": DesktopMapTogglePart,
  "map-workspace": MapWorkspacePart,
  "mobile-map-sheet": MobileMapSheetPart,
  "mobile-map-trigger": MobileMapTriggerPart,
  overview: () => <PublicViewPart option="overview" />,
  table: () => <PublicViewPart option="table" />,
  timeline: () => <PublicViewPart option="timeline" />,
  "trip-header": TripHeaderPart,
  "view-switcher": ViewSwitcherPart,
  "viewer-share-dialog": ViewerShareDialogPart,
} satisfies Partial<Record<PublicTemplatePartId, React.ComponentType>>;
