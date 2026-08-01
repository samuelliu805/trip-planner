"use client";

import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Bike,
  BusFront,
  CableCar,
  CalendarDays,
  CarFront,
  CarTaxiFront,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Footprints,
  Maximize2,
  MoreHorizontal,
  Plane,
  Plus,
  Settings2,
  Ship,
  TrainFront,
  TramFront,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlannerItemForm } from "@/features/itinerary/components/planner-item-form";
import {
  encodePlannerClipboard,
  fillTargetRows,
  moveGridFocus,
  parsePlannerClipboard,
  selectionBounds,
  selectionContains,
  type GridCoordinate,
  type PlannerClipboard,
} from "@/features/itinerary/grid-interactions";
import {
  plannerQueryKey,
  useCopyItineraryItems,
  useDeleteItineraryItem,
  useInsertTripDay,
  usePlannerWorkspace,
  useRemoveTripDay,
  useReorderItineraryItems,
} from "@/features/itinerary/queries";
import {
  normalizeTransportMode,
  transportModeLabels,
  transportModes,
  type CarRentalDetails,
  type ItineraryItem,
  type ItineraryItemType,
  type PlannerDay,
  type PlannerWorkspace as PlannerWorkspaceData,
  type TransportMode,
} from "@/features/itinerary/types";
import type { Tables } from "@/types/database";
import type { MarkerKind, PlannerMapMarker } from "@/features/maps/planner-map-canvas";
import { mergeMarkerDateRanges } from "@/features/maps/marker-date-ranges";

const markerKindLabels: Record<MarkerKind, string> = {
  city: "Cities",
  activity: "Activities",
  hotel: "Hotels",
  carRental: "Car rentals",
  meal: "Meals",
};
const allMarkerKinds = Object.keys(markerKindLabels) as MarkerKind[];

const PlannerMapCanvas = dynamic(
  () => import("@/features/maps/planner-map-canvas").then((module) => module.PlannerMapCanvas),
  { ssr: false },
);

type Category = "city" | "activities" | "transport" | "hotel" | "car_rental" | "meals" | "notes";
type EditorState = { dayId: string; item?: ItineraryItem; type: ItineraryItemType };

const categories: {
  id: Category;
  label: string;
  types: ItineraryItemType[];
  defaultType: ItineraryItemType;
  width: string;
}[] = [
  { id: "city", label: "City", types: ["location"], defaultType: "location", width: "w-36" },
  {
    id: "activities",
    label: "Activities",
    types: ["activity"],
    defaultType: "activity",
    width: "w-52",
  },
  {
    id: "transport",
    label: "Transport",
    types: ["transport", "flight", "train"],
    defaultType: "transport",
    width: "w-44",
  },
  { id: "hotel", label: "Hotel", types: ["hotel"], defaultType: "hotel", width: "w-44" },
  {
    id: "car_rental",
    label: "Car rental",
    types: ["car_rental"],
    defaultType: "car_rental",
    width: "w-44",
  },
  { id: "meals", label: "Meals", types: ["meal"], defaultType: "meal", width: "w-44" },
  { id: "notes", label: "Notes", types: ["note"], defaultType: "note", width: "w-52" },
];
const transportModeIcons: Partial<Record<TransportMode, LucideIcon>> = {
  bike: Bike,
  bus: BusFront,
  cable_car: CableCar,
  ferry: Ship,
  flight: Plane,
  motorcycle: Bike,
  rideshare: CarFront,
  self_driving: CarFront,
  shuttle: BusFront,
  subway: TrainFront,
  taxi: CarTaxiFront,
  train: TrainFront,
  tram: TramFront,
  walk: Footprints,
};
function timeLabel(time: string | null) {
  return time ? time.slice(0, 5) : null;
}

function AddItemPopover({
  category,
  day,
  disabled,
  onComplex,
}: {
  category: (typeof categories)[number];
  day: PlannerDay;
  disabled?: boolean;
  onComplex: () => void;
  tripId: string;
  variantId: string;
}) {
  if (disabled) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={`Add ${category.label.toLowerCase()} on day ${day.day_number}`}
          className="mt-auto flex h-8 w-full shrink-0 items-center justify-center gap-1 rounded border border-dashed bg-background text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          data-add-item
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onComplex();
          }}
          type="button"
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {disabled
          ? "Only one hotel is allowed per day"
          : `Add another ${category.label.toLowerCase()}`}
      </TooltipContent>
    </Tooltip>
  );
}

function InsertRowIcon({ direction }: { direction: "above" | "below" }) {
  return direction === "above" ? (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0 sm:size-3.5"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 3V9M9 6H15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M5 13H19M5 17H19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0 sm:size-3.5"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 7H19M5 11H19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M12 15V21M9 18H15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function DayActions({
  day,
  isOnlyDay,
  location,
  onInsert,
  onRemove,
  pending,
  visible,
}: {
  day: PlannerDay;
  isOnlyDay: boolean;
  location: "cell" | "mobilebar";
  onInsert: (position: number) => void;
  onRemove: (dayId: string) => void;
  pending: boolean;
  visible: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (!visible) return null;
  const mobile = location === "mobilebar";
  const buttonClass = mobile
    ? "flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-primary"
    : "flex h-9 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground";
  const insertIcon = (direction: "up" | "down") => (
    <InsertRowIcon direction={direction === "up" ? "above" : "below"} />
  );
  return (
    <>
      <div
        className={
          mobile
            ? "grid w-full grid-cols-2 gap-2"
            : "mt-2 hidden grid-cols-3 overflow-hidden rounded-md border bg-background shadow-sm sm:grid"
        }
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={`Insert day above day ${day.day_number}`}
              className={buttonClass}
              disabled={pending}
              onClick={(event) => {
                event.stopPropagation();
                onInsert(day.day_number);
              }}
              type="button"
            >
              {insertIcon("up")}
              {mobile ? <span>Add day before</span> : null}
            </button>
          </TooltipTrigger>
          <TooltipContent>Insert a new day above Day {day.day_number}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={`Insert day below day ${day.day_number}`}
              className={`${buttonClass} ${!mobile ? "border-l" : ""}`}
              disabled={pending}
              onClick={(event) => {
                event.stopPropagation();
                onInsert(day.day_number + 1);
              }}
              type="button"
            >
              {insertIcon("down")}
              {mobile ? <span>Add day after</span> : null}
            </button>
          </TooltipTrigger>
          <TooltipContent>Insert a new day below Day {day.day_number}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={`Remove day ${day.day_number}`}
              className={
                mobile
                  ? "col-span-2 flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-destructive disabled:opacity-30"
                  : "flex h-9 items-center justify-center border-l text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
              }
              disabled={isOnlyDay || pending}
              onClick={(event) => {
                event.stopPropagation();
                setConfirmOpen(true);
              }}
              type="button"
            >
              <Trash2 className="size-3.5" />
              {mobile ? <span>Remove day</span> : null}
            </button>
          </TooltipTrigger>
          <TooltipContent>Remove Day {day.day_number}</TooltipContent>
        </Tooltip>
      </div>
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Day {day.day_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This also deletes every itinerary item in this day. The remaining days and dates will
              be renumbered automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep day</AlertDialogCancel>
            <AlertDialogAction onClick={() => onRemove(day.id)}>Remove day</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ItemRow({
  canMoveDown,
  canMoveUp,
  interactive,
  item,
  onDelete,
  onEdit,
  onMove,
  onSelect,
  selected,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  interactive: boolean;
  item: ItineraryItem;
  onDelete: (item: ItineraryItem) => void;
  onEdit: (item: ItineraryItem) => void;
  onMove: (direction: -1 | 1) => void;
  onSelect: (item: ItineraryItem) => void;
  selected: boolean;
}) {
  const start = timeLabel(item.start_time);
  const details = item.details as Record<string, string | undefined>;
  const mode =
    item.type === "transport"
      ? normalizeTransportMode(details.mode)
      : item.type === "flight"
        ? "flight"
        : item.type === "train"
          ? "train"
          : null;
  const ModeIcon = mode ? (transportModeIcons[mode] ?? CarFront) : null;
  const car = item.type === "car_rental" ? (details as CarRentalDetails) : null;
  const carSummary = car ? [car.provider, car.address].filter(Boolean).join(" · ") : "";
  const title = mode ? transportModeLabels[mode] : item.title;
  return (
    <div
      className={`group/item flex min-w-0 items-center rounded ${selected ? "bg-primary/10 ring-1 ring-primary/40" : interactive ? "hover:bg-muted/70" : ""}`}
    >
      <button
        className="min-w-0 flex-1 rounded px-1.5 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-edit-item={item.id}
        aria-pressed={selected}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(item);
        }}
        onDoubleClick={(event) => {
          if (interactive) {
            event.stopPropagation();
            onEdit(item);
          }
        }}
        onKeyDown={(event) => {
          if (event.altKey && event.key === "ArrowUp" && canMoveUp) {
            event.preventDefault();
            event.stopPropagation();
            onMove(-1);
          }
          if (event.altKey && event.key === "ArrowDown" && canMoveDown) {
            event.preventDefault();
            event.stopPropagation();
            onMove(1);
          }
        }}
        tabIndex={interactive ? 0 : -1}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {ModeIcon ? <ModeIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
          {start ? (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{start}</span>
          ) : null}
          <span className="truncate font-medium">{title}</span>
        </span>
        {carSummary ? (
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
            {carSummary}
          </span>
        ) : null}
      </button>
      {interactive ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`Actions for ${title}`}
              className="flex size-7 shrink-0 items-center justify-center rounded hover:bg-background"
              onClick={(event) => event.stopPropagation()}
              type="button"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(item)}>Edit item</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}>
              Move up <span className="ml-auto text-xs text-muted-foreground">Alt+↑</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(1)}>
              Move down <span className="ml-auto text-xs text-muted-foreground">Alt+↓</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete(item)}
            >
              <Trash2 className="size-4" />
              Delete item
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function MapShell({
  compact = false,
  markers,
  onExpand,
  onMarkerClick,
  selectedId,
  visibleKinds,
  onToggleKind,
}: {
  compact?: boolean;
  markers: PlannerMapMarker[];
  onExpand?: () => void;
  onMarkerClick: (id: string) => void;
  selectedId?: string;
  visibleKinds: Set<MarkerKind>;
  onToggleKind: (kind: MarkerKind) => void;
}) {
  const visibleMarkers = visibleKinds.size
    ? markers.filter((marker) => visibleKinds.has(marker.entries[0].kind))
    : markers;
  return (
    <section
      aria-label="Itinerary map"
      className="relative h-full min-w-0 overflow-hidden bg-muted/40"
    >
      <PlannerMapCanvas
        compact={compact}
        markers={visibleMarkers}
        onMarkerClick={onMarkerClick}
        selectedId={selectedId}
      />
      {!compact && selectedId
        ? (() => {
            const marker = visibleMarkers.find(({ itemIds }) => itemIds.includes(selectedId));
            const entry = marker?.entries.find(({ itemId }) => itemId === selectedId);
            const dayCount = new Set(marker?.entries.map(({ dayNumber }) => dayNumber)).size;
            const dateRanges = marker ? mergeMarkerDateRanges(marker.entries) : "";
            const staySummary =
              entry?.kind === "hotel"
                ? `Total ${dayCount} ${dayCount === 1 ? "day" : "days"} at this hotel`
                : entry?.kind === "city"
                  ? `Total ${dayCount} ${dayCount === 1 ? "day" : "days"} in this city`
                  : null;
            const eventSummary = entry
              ? entry.kind === "activity"
                ? `${marker?.entries.length} ${marker?.entries.length === 1 ? "activity" : "activities"} here`
                : entry.kind === "meal"
                  ? `${marker?.entries.length} ${marker?.entries.length === 1 ? "meal" : "meals"} here`
                  : entry.kind === "carRental"
                    ? `${marker?.entries.length} car rental ${marker?.entries.length === 1 ? "event" : "events"} here`
                    : `${marker?.entries.length} car rental ${marker?.entries.length === 1 ? "event" : "events"} here`
              : "";
            return marker && entry ? (
              <div
                className="absolute bottom-3 left-3 right-3 z-10 rounded-lg border bg-background/95 px-3 py-2 shadow-lg backdrop-blur"
                aria-live="polite"
              >
                <p className="truncate text-sm font-semibold">{entry.title}</p>
                {marker.address ? (
                  <p className="truncate text-xs text-muted-foreground">{marker.address}</p>
                ) : null}
                {staySummary ? (
                  <p className="mt-1 text-xs">
                    <span className="font-medium">{staySummary}</span>
                    <span className="text-muted-foreground"> · {dateRanges}</span>
                  </p>
                ) : marker.entries.length === 1 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{entry.dayLabel}</p>
                ) : compact ? (
                  <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground">
                    {eventSummary} · {dateRanges}
                  </p>
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
                          className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-2.5 py-1.5 text-left text-xs last:border-b-0 ${candidate.itemId === selectedId ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}
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
            ) : null;
          })()
        : null}
      {onExpand ? (
        <button
          aria-label="Open full-screen map"
          className="absolute right-2 top-2 z-20 flex h-10 items-center justify-center gap-1.5 rounded-md border bg-background/95 px-3 text-xs font-medium shadow-sm backdrop-blur"
          onClick={onExpand}
          type="button"
        >
          <Maximize2 className="size-4" />
          Open map
        </button>
      ) : null}
      {!compact ? (
        <div
          className="absolute left-2 top-2 z-20 flex max-w-[calc(100%-1rem)] flex-wrap gap-1 overflow-x-auto"
          aria-label="Map pin filters"
        >
          {allMarkerKinds.map((kind) => (
            <button
              aria-pressed={visibleKinds.has(kind)}
              className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm ${visibleKinds.has(kind) ? "border-primary bg-primary text-primary-foreground" : "bg-background/90 text-muted-foreground"}`}
              key={kind}
              onClick={() => onToggleKind(kind)}
              type="button"
            >
              {markerKindLabels[kind]}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function PlannerWorkspace({
  deleteError,
  initialWorkspace,
  settings,
  trip,
}: {
  deleteError: boolean;
  initialWorkspace: PlannerWorkspaceData;
  settings: React.ReactNode;
  trip: Tables<"trips">;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: workspace = initialWorkspace, error: workspaceError } = usePlannerWorkspace(
    trip.id,
    initialWorkspace,
  );
  const copyMutation = useCopyItineraryItems(trip.id);
  const deleteMutation = useDeleteItineraryItem(trip.id);
  const reorderMutation = useReorderItineraryItems(trip.id);
  const insertDayMutation = useInsertTripDay(trip.id);
  const removeDayMutation = useRemoveTripDay(trip.id);
  const [split, setSplit] = useState(58);
  const [selectionAnchor, setSelectionAnchor] = useState<GridCoordinate>({ row: -1, column: -1 });
  const [selectionEnd, commitSelectionEnd] = useState<GridCoordinate>({ row: -1, column: -1 });
  const [selectedDayRow, setSelectedDayRow] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copyDaysOpen, setCopyDaysOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [visibleMarkerKinds, setVisibleMarkerKinds] = useState<Set<MarkerKind>>(() => new Set());
  const [targetDays, setTargetDays] = useState<Set<string>>(new Set());
  const [interactionError, setInteractionError] = useState<string>();
  const [internalClipboard, setInternalClipboard] = useState<PlannerClipboard | null>(null);
  const [isFillDragging, setIsFillDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionEndRef = useRef(selectionEnd);
  const fillDragging = useRef(false);
  const fillFrame = useRef<number | null>(null);
  const fillSourceRight = useRef(0);
  const rangeJustSelected = useRef(false);
  useEffect(() => {
    selectionEndRef.current = selectionEnd;
  }, [selectionEnd]);
  const mutating = useIsMutating() > 0;
  const selectedCount =
    selectionEnd.row < 0
      ? 0
      : (Math.abs(selectionAnchor.row - selectionEnd.row) + 1) *
        (Math.abs(selectionAnchor.column - selectionEnd.column) + 1);
  const selectedDay = selectedDayRow === null ? null : workspace.days[selectedDayRow];
  const activeDay = workspace.days[selectionEnd.row];
  const activeCategory = categories[selectionEnd.column];
  const activeTransportModes =
    activeDay?.items
      .filter((item) => item.type === "transport")
      .map((item) => normalizeTransportMode((item.details as Record<string, string>).mode)) ?? [];
  const activeCellAtCapacity =
    (activeCategory?.id === "hotel" &&
      Boolean(activeDay?.items.some((item) => activeCategory.types.includes(item.type)))) ||
    (activeCategory?.id === "transport" && activeTransportModes.length >= transportModes.length);
  const unavailableTransportModes = editor
    ? (workspace.days
        .find((day) => day.id === editor.dayId)
        ?.items.filter((item) => item.type === "transport" && item.id !== editor.item?.id)
        .map((item) => normalizeTransportMode((item.details as Record<string, string>).mode)) ?? [])
    : [];
  const visibleSelectionBounds = selectionBounds(selectionAnchor, selectionEnd);
  const itemCount = workspace.days.reduce((count, day) => count + day.items.length, 0);
  const dateRange =
    trip.start_date && trip.end_date
      ? `${format(parseISO(trip.start_date), "MMM d")} – ${format(parseISO(trip.end_date), "MMM d, yyyy")}`
      : `${trip.day_count} planning ${trip.day_count === 1 ? "day" : "days"} · Dates not set`;
  const gridTemplate = useMemo(
    () => `minmax(520px, ${split}fr) 4px minmax(360px, ${100 - split}fr)`,
    [split],
  );
  const selectedMapItem = useMemo(() => {
    const day = workspace.days[selectionEnd.row];
    const category = categories[selectionEnd.column];
    if (!day || !category) return undefined;
    const cellItems = day.items.filter((item) => category.types.includes(item.type));
    return cellItems.find(({ id }) => id === selectedItemId) ?? cellItems[0];
  }, [selectedItemId, selectionEnd.column, selectionEnd.row, workspace.days]);
  const mapMarkers = useMemo(() => {
    const grouped = new Map<string, PlannerMapMarker>();
    for (const day of workspace.days)
      for (const item of day.items) {
        if (!item.place || ["transport", "flight", "train", "note"].includes(item.type)) continue;
        const entry: PlannerMapMarker["entries"][number] = {
          dayLabel: day.date ? format(parseISO(day.date), "MMM d") : `Day ${day.day_number}`,
          dayNumber: day.day_number,
          itemId: item.id,
          kind:
            item.type === "location"
              ? "city"
              : item.type === "activity"
                ? "activity"
                : item.type === "hotel"
                  ? "hotel"
                  : item.type === "car_rental"
                    ? "carRental"
                    : item.type === "meal"
                      ? "meal"
                      : "carRental",
          title: item.title,
        };
        const groupKey = `${item.place.id}:${entry.kind}`;
        const existing = grouped.get(groupKey);
        if (existing) {
          existing.entries.push(entry);
          existing.itemIds.push(item.id);
        } else {
          grouped.set(groupKey, {
            address: item.place.formattedAddress,
            entries: [entry],
            id: groupKey,
            itemIds: [item.id],
            latitude: item.place.latitude,
            longitude: item.place.longitude,
          });
        }
      }
    return [...grouped.values()];
  }, [workspace.days]);
  function selectMarker(itemId: string) {
    workspace.days.some((day, row) => {
      const item = day.items.find(({ id }) => id === itemId);
      if (!item) return false;
      const column = categories.findIndex(({ types }) => types.includes(item.type));
      const coordinate = { row, column };
      setSelectionAnchor(coordinate);
      setSelectionEnd(coordinate);
      setSelectedItemId(item.id);
      return true;
    });
  }
  function toggleMarkerKind(kind: MarkerKind) {
    setVisibleMarkerKinds((current) => {
      if (!current.size) return new Set([kind]);
      const next = new Set(current);
      if (next.has(kind)) {
        if (next.size === 1) return new Set();
        next.delete(kind);
      } else {
        next.add(kind);
        if (next.size === allMarkerKinds.length) return new Set();
      }
      return next;
    });
  }
  const dayMutationPending = insertDayMutation.isPending || removeDayMutation.isPending;

  async function insertDay(beforeDayNumber: number) {
    try {
      await insertDayMutation.mutateAsync({ beforeDayNumber, tripId: trip.id });
      setInteractionError(undefined);
      router.refresh();
    } catch (error) {
      setInteractionError(
        error instanceof Error ? error.message : "The day could not be inserted.",
      );
    }
  }

  async function removeDay(dayId: string) {
    try {
      await removeDayMutation.mutateAsync({ dayId, tripId: trip.id });
      setInteractionError(undefined);
      router.refresh();
    } catch (error) {
      setInteractionError(error instanceof Error ? error.message : "The day could not be removed.");
    }
  }

  function setSelectionEnd(coordinate: GridCoordinate) {
    selectionEndRef.current = coordinate;
    if (!fillDragging.current) {
      commitSelectionEnd(coordinate);
      return;
    }
    if (fillFrame.current !== null) return;
    fillFrame.current = requestAnimationFrame(() => {
      fillFrame.current = null;
      commitSelectionEnd(selectionEndRef.current);
    });
  }

  function clipboardPayload(): PlannerClipboard | null {
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    if (bounds.top !== bounds.bottom) return null;
    const cells = [];
    for (let row = bounds.top; row <= bounds.bottom; row += 1)
      for (let column = bounds.left; column <= bounds.right; column += 1) {
        const day = workspace.days[row];
        const category = categories[column];
        if (!day || !category) continue;
        const items = day.items
          .filter((item) => category.types.includes(item.type))
          .map(({ id }) => id);
        cells.push({ columnOffset: column - bounds.left, items, rowOffset: row - bounds.top });
      }
    return cells.length
      ? { cells, kind: "trip-planner/items", sourceColumn: bounds.left, version: 2 }
      : null;
  }

  async function copySelectionToClipboard() {
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    if (bounds.top !== bounds.bottom) {
      setInteractionError("Copy and paste works with cells selected across one row only.");
      return;
    }
    const payload = clipboardPayload();
    if (!payload) {
      setInteractionError("The selected cells do not contain items to copy.");
      return;
    }
    setInternalClipboard(payload);
    setInteractionError(undefined);
    try {
      await navigator.clipboard.writeText(encodePlannerClipboard(payload));
    } catch {
      /* The internal clipboard remains available. */
    }
  }

  async function replaceCategoryItems(
    operations: { sourceItemIds: string[]; targetDay: PlannerDay; types: ItineraryItemType[] }[],
  ) {
    const previous = queryClient.getQueryData<PlannerWorkspaceData>(plannerQueryKey(trip.id));
    const replacements = operations
      .filter(
        (operation) =>
          !operation.targetDay.items.some((item) => operation.sourceItemIds.includes(item.id)),
      )
      .map((operation) => ({
        ...operation,
        replacedItems: operation.targetDay.items.filter((item) =>
          operation.types.includes(item.type),
        ),
      }));
    try {
      const replacedIds = new Set(
        replacements.flatMap(({ replacedItems }) => replacedItems.map(({ id }) => id)),
      );
      queryClient.setQueryData<PlannerWorkspaceData>(plannerQueryKey(trip.id), (current) =>
        current
          ? {
              ...current,
              days: current.days.map((day) => ({
                ...day,
                items: day.items.filter(({ id }) => !replacedIds.has(id)),
              })),
            }
          : current,
      );
      await Promise.all(
        replacements.flatMap(({ replacedItems }) =>
          replacedItems.map((item) => deleteMutation.mutateAsync({ id: item.id, tripId: trip.id })),
        ),
      );
      await Promise.all(
        replacements
          .filter(({ sourceItemIds }) => sourceItemIds.length > 0)
          .map(({ sourceItemIds, targetDay }) =>
            copyMutation.mutateAsync({ sourceItemIds, targetDayId: targetDay.id, tripId: trip.id }),
          ),
      );
      setInteractionError(undefined);
    } catch (error) {
      queryClient.setQueryData(plannerQueryKey(trip.id), previous);
      void queryClient.invalidateQueries({ queryKey: plannerQueryKey(trip.id) });
      setInteractionError(
        error instanceof Error
          ? `${error.message} Refreshing the planner to confirm saved values.`
          : "The destination cells could not be replaced.",
      );
    }
  }

  async function pastePayload(payload: PlannerClipboard) {
    try {
      const selectedBounds = selectionBounds(selectionAnchor, selectionEnd);
      if (selectedBounds.top !== selectedBounds.bottom)
        throw new Error("Paste works only when the selected destination cells are in one row.");
      const destination = { column: selectedBounds.left, row: selectedBounds.top };
      if (destination.column !== payload.sourceColumn)
        throw new Error(
          `Paste blocked: copied ${categories[payload.sourceColumn]?.label ?? "column"} cells can only be pasted into the same column.`,
        );
      const operations = payload.cells.map((cell) => {
        const category = categories[destination.column + cell.columnOffset];
        if (!category) throw new Error("Clipboard data does not fit the selected range.");
        const day = workspace.days[destination.row + cell.rowOffset];
        if (!day) throw new Error("Clipboard data does not fit the available trip days.");
        return { sourceItemIds: cell.items, targetDay: day, types: category.types };
      });
      await replaceCategoryItems(operations);
    } catch (error) {
      setInteractionError(
        error instanceof Error ? error.message : "The copied items could not be pasted.",
      );
    }
  }

  async function pasteAvailableClipboard() {
    let payload = internalClipboard;
    if (!payload)
      try {
        payload = parsePlannerClipboard(await navigator.clipboard.readText());
      } catch {
        /* System clipboard access is optional. */
      }
    if (payload) await pastePayload(payload);
    else setInteractionError("Copy planner cells before pasting.");
  }

  async function fillDown(anchor = selectionAnchor, end = selectionEndRef.current) {
    const bounds = selectionBounds(anchor, end);
    const sourceDay = workspace.days[bounds.top];
    if (!sourceDay || bounds.bottom === bounds.top) {
      setInteractionError("Select at least two day rows to fill down.");
      return;
    }
    const selectedCategories = categories.slice(bounds.left, bounds.right + 1);
    await replaceCategoryItems(
      fillTargetRows(anchor, end).flatMap((row) =>
        selectedCategories.map((category) => ({
          sourceItemIds: sourceDay.items
            .filter((item) => category.types.includes(item.type))
            .map(({ id }) => id),
          targetDay: workspace.days[row],
          types: category.types,
        })),
      ),
    );
  }

  async function copyPreviousDay() {
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    if (bounds.top < 1) {
      setInteractionError("The first day has no previous day to copy.");
      return;
    }
    const source = workspace.days[bounds.top - 1];
    const target = workspace.days[bounds.top];
    await replaceCategoryItems(
      categories.slice(bounds.left, bounds.right + 1).map((category) => ({
        sourceItemIds: source.items
          .filter((item) => category.types.includes(item.type))
          .map(({ id }) => id),
        targetDay: target,
        types: category.types,
      })),
    );
  }

  async function copyToSelectedDays() {
    if (!targetDays.size) {
      setInteractionError("Choose at least one destination day.");
      return;
    }
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    const sourceDay = workspace.days[bounds.top];
    if (!sourceDay) return;
    const destinationDayIds = [...targetDays].filter((dayId) => dayId !== sourceDay.id);
    if (!destinationDayIds.length) {
      setInteractionError("Choose a destination day other than the source day.");
      return;
    }
    const selectedCategories = categories.slice(bounds.left, bounds.right + 1);
    await replaceCategoryItems(
      destinationDayIds.flatMap((dayId) => {
        const targetDay = workspace.days.find((day) => day.id === dayId);
        return targetDay
          ? selectedCategories.map((category) => ({
              sourceItemIds: sourceDay.items
                .filter((item) => category.types.includes(item.type))
                .map(({ id }) => id),
              targetDay,
              types: category.types,
            }))
          : [];
      }),
    );
    setTargetDays(new Set());
    setCopyDaysOpen(false);
  }

  async function moveItem(
    day: PlannerDay,
    categoryItems: ItineraryItem[],
    itemIndex: number,
    direction: -1 | 1,
  ) {
    const targetIndex = itemIndex + direction;
    if (targetIndex < 0 || targetIndex >= categoryItems.length) return;
    const reorderedCategory = [...categoryItems];
    [reorderedCategory[itemIndex], reorderedCategory[targetIndex]] = [
      reorderedCategory[targetIndex],
      reorderedCategory[itemIndex],
    ];
    let categoryIndex = 0;
    const ordered = [...day.items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) =>
        categoryItems.some(({ id }) => id === item.id) ? reorderedCategory[categoryIndex++] : item,
      );
    try {
      await reorderMutation.mutateAsync({
        dayId: day.id,
        items: ordered.map((item, sortOrder) => ({ id: item.id, sortOrder })),
        tripId: trip.id,
      });
      setInteractionError(undefined);
    } catch {
      setInteractionError("The item order could not be saved. The previous order was restored.");
    }
  }

  async function deleteItem(item: ItineraryItem) {
    try {
      await deleteMutation.mutateAsync({ id: item.id, tripId: trip.id });
      setInteractionError(undefined);
    } catch {
      setInteractionError(`“${item.title}” could not be deleted. Please try again.`);
    }
  }

  function focusCell(coordinate: GridCoordinate, extend: boolean) {
    if (rangeJustSelected.current) {
      rangeJustSelected.current = false;
      return;
    }
    setSelectedDayRow(null);
    setSelectedItemId(undefined);
    if (extend) setSelectionEnd(coordinate);
    else {
      setSelectionAnchor(coordinate);
      setSelectionEnd(coordinate);
    }
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-cell="${coordinate.row}-${coordinate.column}"]`)
        ?.focus(),
    );
  }

  function selectDay(row: number) {
    setSelectedDayRow(row);
    setSelectedItemId(undefined);
    setSelectionAnchor({ column: -1, row: -1 });
    setSelectionEnd({ column: -1, row: -1 });
    setInteractionError(undefined);
  }

  function startRangeSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (window.innerWidth < 1200) return;
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest(
        "button, input, textarea, [role='menuitem'], [role='option']",
      )
    )
      return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell?.dataset.cell) return;
    const [row, column] = cell.dataset.cell.split("-").map(Number);
    const anchor = { column, row };
    let moved = false;
    setSelectionAnchor(anchor);
    setSelectionEnd(anchor);
    const move = (moveEvent: PointerEvent) => {
      const targetCell = document
        .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
        ?.closest<HTMLElement>("[data-cell]");
      if (!targetCell?.dataset.cell) return;
      const [nextRow, nextColumn] = targetCell.dataset.cell.split("-").map(Number);
      if (nextRow === row && nextColumn === column) return;
      moved = true;
      setSelectionEnd({ column: nextColumn, row });
    };
    const stop = () => {
      rangeJustSelected.current = moved;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function handleCellKey(
    event: React.KeyboardEvent,
    coordinate: GridCoordinate,
    day: PlannerDay,
    category: (typeof categories)[number],
    items: ItineraryItem[],
  ) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(event.key)) {
      event.preventDefault();
      focusCell(
        moveGridFocus(
          coordinate,
          event.key,
          workspace.days.length,
          categories.length,
          event.shiftKey,
        ),
        event.shiftKey && event.key !== "Tab",
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[0];
      setEditor(
        item
          ? { dayId: day.id, item, type: item.type }
          : { dayId: day.id, type: category.defaultType },
      );
    }
    if (event.key === "Escape") {
      setEditor(null);
      focusCell(coordinate, false);
    }
  }

  function startFill(event: React.PointerEvent) {
    if (window.innerWidth < 1200) return;
    const bounds = selectionBounds(selectionAnchor, selectionEnd);
    if (bounds.top !== bounds.bottom) {
      setInteractionError("Drag fill works only with cells selected across one row.");
      return;
    }
    const sourceAnchor = { column: bounds.left, row: bounds.top };
    const sourceEnd = { column: bounds.right, row: bounds.top };
    event.preventDefault();
    event.stopPropagation();
    fillSourceRight.current = bounds.right;
    fillDragging.current = true;
    setIsFillDragging(true);
    setSelectionAnchor(sourceAnchor);
    setSelectionEnd(sourceEnd);
    const finish = () => {
      const fillEnd = selectionEndRef.current;
      fillDragging.current = false;
      setIsFillDragging(false);
      if (fillFrame.current !== null) cancelAnimationFrame(fillFrame.current);
      fillFrame.current = null;
      window.removeEventListener("pointerup", finish);
      setSelectionAnchor({ column: -1, row: -1 });
      setSelectionEnd({ column: -1, row: -1 });
      void fillDown(sourceAnchor, fillEnd);
    };
    window.addEventListener("pointerup", finish);
  }

  function openEditorFromDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button") && !target.closest("[data-edit-item]")) return;
    const cell = target.closest<HTMLElement>("[data-cell]");
    if (!cell?.dataset.cell) return;
    const [row, column] = cell.dataset.cell.split("-").map(Number);
    const day = workspace.days[row];
    const category = categories[column];
    if (!day || !category) return;
    const requestedId = target.closest<HTMLElement>("[data-edit-item]")?.dataset.editItem;
    const item = requestedId
      ? day.items.find(({ id }) => id === requestedId)
      : day.items.find((candidate) => category.types.includes(candidate.type));
    setEditor(
      item
        ? { dayId: day.id, item, type: item.type }
        : { dayId: day.id, type: category.defaultType },
    );
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (bounds)
        setSplit(
          Math.min(68, Math.max(45, ((moveEvent.clientX - bounds.left) / bounds.width) * 100)),
        );
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <div
      className="planner-workspace flex h-full min-h-0 flex-col overflow-hidden bg-background"
      onCopy={(event) => {
        const payload = clipboardPayload();
        if (payload) {
          event.preventDefault();
          event.clipboardData.setData("text/plain", encodePlannerClipboard(payload));
          setInternalClipboard(payload);
          setInteractionError(undefined);
        }
      }}
      onPaste={(event) => {
        const payload =
          parsePlannerClipboard(event.clipboardData.getData("text/plain")) ?? internalClipboard;
        if (!payload) {
          setInteractionError(
            "Unsupported clipboard data. Copy cells from this planner before pasting.",
          );
          return;
        }
        event.preventDefault();
        void pastePayload(payload);
      }}
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-2 sm:px-4 xl:h-[72px] xl:gap-4 xl:px-5">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2 xl:gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild className="size-11 p-0 xl:size-9" variant="ghost">
                <Link aria-label="Back to Trips" href="/trips">
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to Trips</TooltipContent>
          </Tooltip>
          <div className="min-w-0">
            <h1 className="max-w-[180px] truncate text-base font-semibold sm:max-w-[260px] xl:max-w-none xl:text-lg">
              {trip.title}
            </h1>
            <p className="mt-0.5 hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">
              <CalendarDays className="size-3.5" />
              {dateRange}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground sm:gap-2">
          <span
            className="hidden items-center gap-1.5 whitespace-nowrap sm:flex"
            aria-live="polite"
          >
            {mutating ? (
              <span className="size-2 animate-pulse rounded-full bg-amber-500" />
            ) : (
              <Check className="size-3.5 text-primary" />
            )}
            <span>{mutating ? "Saving…" : "Saved"}</span>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="More trip actions"
                className="size-11 p-0 xl:size-9"
                variant="outline"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="xl:hidden" onSelect={copySelectionToClipboard}>
                <Copy className="size-4" />
                Copy selected cells
              </DropdownMenuItem>
              <DropdownMenuItem className="xl:hidden" onSelect={pasteAvailableClipboard}>
                <ClipboardPaste className="size-4" />
                Paste
              </DropdownMenuItem>
              <DropdownMenuItem className="xl:hidden" onSelect={() => setCopyDaysOpen(true)}>
                Copy to days…
              </DropdownMenuItem>
              <DropdownMenuItem className="xl:hidden" onSelect={copyPreviousDay}>
                Copy previous day
              </DropdownMenuItem>
              <DropdownMenuSeparator className="xl:hidden" />
              <DropdownMenuItem
                disabled={dayMutationPending}
                onSelect={() => void insertDay(workspace.days.length + 1)}
              >
                <Plus className="size-4" />
                Add day at end
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <Settings2 className="size-4" />
                Trip settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {selectedDay ? (
        <div className="shrink-0 border-b bg-muted/20 px-3 py-2 sm:hidden">
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
            Day {selectedDay.day_number} row actions
          </div>
          <DayActions
            day={selectedDay}
            isOnlyDay={workspace.days.length === 1}
            location="mobilebar"
            onInsert={(position) => void insertDay(position)}
            onRemove={(dayId) => void removeDay(dayId)}
            pending={dayMutationPending}
            visible
          />
        </div>
      ) : null}
      <div className="hidden h-10 shrink-0 items-center justify-between gap-3 border-b bg-muted/20 px-3 xl:flex">
        <div className="flex items-center gap-1 whitespace-nowrap">
          {selectedCount === 1 && !activeCellAtCapacity ? (
            <Button
              className="h-7 px-2.5 text-xs"
              onClick={() => {
                if (activeDay && activeCategory)
                  setEditor({ dayId: activeDay.id, type: activeCategory.defaultType });
              }}
              size="sm"
            >
              <Plus className="size-3.5" />
              Add item
            </Button>
          ) : null}
          <Button
            className="h-7 px-2 text-xs"
            disabled={dayMutationPending}
            onClick={() => void insertDay(workspace.days.length + 1)}
            size="sm"
            variant="ghost"
          >
            <Plus className="size-3.5" />
            Add day
          </Button>
          <Button
            className="h-7 px-2 text-xs"
            onClick={copySelectionToClipboard}
            size="sm"
            variant="ghost"
          >
            <Copy className="size-3.5" />
            Copy
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="More editing actions"
                className="size-7 p-0"
                size="sm"
                variant="ghost"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setCopyDaysOpen(true)}>
                Copy to days…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={copyPreviousDay}>Copy previous day</DropdownMenuItem>
              <DropdownMenuItem onSelect={pasteAvailableClipboard}>
                <ClipboardPaste className="size-4" />
                Paste
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          Selected: {selectedCount} {selectedCount === 1 ? "cell" : "cells"}
        </span>
      </div>
      {interactionError ? (
        <div
          className="flex items-center justify-between border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive"
          role="alert"
        >
          <span>{interactionError}</span>
          <button
            className="underline"
            onClick={() => setInteractionError(undefined)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {workspaceError ? (
        <p className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive" role="alert">
          The planner could not refresh. Your last loaded data remains visible.
        </p>
      ) : null}
      {deleteError ? (
        <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
          The trip could not be deleted.
        </p>
      ) : null}
      {itemCount === 0 ? (
        <p className="border-b bg-primary/5 px-4 py-2 text-xs text-muted-foreground" role="status">
          This itinerary is empty. Select a category cell, then choose Add item.
        </p>
      ) : null}
      {isFillDragging ? (
        <div
          className="pointer-events-none fixed left-1/2 top-28 z-50 -translate-x-1/2 rounded-full border bg-background/95 px-4 py-2 text-xs font-medium shadow-lg backdrop-blur"
          role="status"
        >
          Release to copy {categories[selectionAnchor.column]?.label ?? "this column"} down through
          Day {workspace.days[selectionEnd.row]?.day_number ?? ""}. Only this column will change.
        </div>
      ) : null}
      <div
        className="planner-layout grid min-h-0 flex-1 overflow-hidden"
        ref={containerRef}
        style={{ "--planner-grid-template": gridTemplate } as React.CSSProperties}
      >
        <section
          aria-label="Editable trip planning matrix"
          className="planner-matrix min-w-0 overflow-auto bg-background"
        >
          <div
            className="min-w-max select-none"
            data-fill-dragging={isFillDragging || undefined}
            role="grid"
            aria-label={`${trip.title} itinerary`}
            aria-multiselectable="true"
            aria-rowcount={workspace.days.length + 1}
            aria-colcount={9}
            onDoubleClick={openEditorFromDoubleClick}
            onPointerDown={startRangeSelection}
          >
            <div
              className="sticky top-0 z-30 flex h-9 border-b bg-muted/95 text-[11px] font-semibold text-muted-foreground"
              role="row"
            >
              <div
                className="sticky left-0 z-40 flex w-24 shrink-0 items-center border-r bg-muted px-2"
                role="columnheader"
              >
                Date
              </div>
              <div
                className="sticky left-24 z-40 flex w-16 shrink-0 items-center border-r bg-muted px-2"
                role="columnheader"
              >
                Day
              </div>
              {categories.map((category) => (
                <div
                  className={`${category.width} flex shrink-0 items-center border-r px-2`}
                  key={category.id}
                  role="columnheader"
                >
                  {category.label}
                </div>
              ))}
            </div>
            {workspace.days.map((day, row) => (
              <div className="contents" key={day.id}>
                <div className="flex min-h-24 border-b" role="row" aria-rowindex={row + 2}>
                  <div
                    aria-selected={selectedDayRow === row}
                    className={`sticky left-0 z-20 w-24 shrink-0 cursor-pointer border-r px-2 py-2 font-mono text-[11px] ${selectedDayRow === row ? "bg-primary/10 shadow-[inset_0_0_0_2px_var(--primary)]" : "bg-background"}`}
                    onClick={() => selectDay(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectDay(row);
                      }
                    }}
                    role="rowheader"
                    tabIndex={0}
                  >
                    <span className="block font-sans text-xs font-semibold sm:hidden">
                      Day {day.day_number}
                    </span>
                    <span className="mt-1 block text-xs font-medium sm:mt-0">
                      {day.date ? format(parseISO(day.date), "MMM d") : "Date TBD"}
                    </span>
                    <span className="mt-0.5 block font-sans text-[10px] text-muted-foreground">
                      {day.date ? format(parseISO(day.date), "EEE") : "Add dates later"}
                    </span>
                    <DayActions
                      day={day}
                      isOnlyDay={workspace.days.length === 1}
                      location="cell"
                      onInsert={(position) => void insertDay(position)}
                      onRemove={(dayId) => void removeDay(dayId)}
                      pending={dayMutationPending}
                      visible={selectedDayRow === row}
                    />
                  </div>
                  <div
                    className="sticky left-24 z-20 w-16 shrink-0 border-r bg-background px-2 py-2 text-xs font-semibold"
                    role="rowheader"
                  >
                    {day.day_number}
                  </div>
                  {categories.map((category, column) => {
                    const coordinate = { row, column };
                    const items = day.items
                      .filter((item) => category.types.includes(item.type))
                      .sort((a, b) => a.sort_order - b.sort_order);
                    const selected = selectionContains(selectionAnchor, selectionEnd, coordinate);
                    const active =
                      selectedCount === 1 &&
                      selectionEnd.row === row &&
                      selectionEnd.column === column;
                    const lastSelected =
                      row === visibleSelectionBounds.bottom &&
                      column === visibleSelectionBounds.right;
                    return (
                      <div
                        aria-selected={selected}
                        className={`${category.width} group relative flex shrink-0 flex-col border-r p-1 ${selected ? "bg-primary/5 shadow-[inset_0_0_0_2px_var(--primary)]" : "bg-background"}`}
                        data-cell={`${row}-${column}`}
                        key={category.id}
                        onClick={(event) => focusCell(coordinate, event.shiftKey)}
                        onKeyDown={(event) =>
                          handleCellKey(event, coordinate, day, category, items)
                        }
                        onPointerEnter={() => {
                          if (fillDragging.current) {
                            const sameColumn = {
                              column: fillSourceRight.current,
                              row: coordinate.row,
                            };
                            selectionEndRef.current = sameColumn;
                            setSelectionEnd(sameColumn);
                          }
                        }}
                        role="gridcell"
                        tabIndex={active ? 0 : -1}
                      >
                        <div className="space-y-0.5">
                          {items.map((item, itemIndex) => (
                            <ItemRow
                              interactive={selected}
                              onDelete={(selectedItem) => void deleteItem(selectedItem)}
                              canMoveDown={itemIndex < items.length - 1}
                              canMoveUp={itemIndex > 0}
                              item={item}
                              key={item.id}
                              onEdit={(selectedItem) =>
                                setEditor({
                                  dayId: day.id,
                                  item: selectedItem,
                                  type: selectedItem.type,
                                })
                              }
                              onMove={(direction) =>
                                void moveItem(day, items, itemIndex, direction)
                              }
                              onSelect={() => {
                                const coordinate = { row, column };
                                setSelectionAnchor(coordinate);
                                setSelectionEnd(coordinate);
                                setSelectedItemId(item.id);
                              }}
                              selected={item.id === selectedMapItem?.id}
                            />
                          ))}
                        </div>
                        {active ? (
                          <AddItemPopover
                            category={category}
                            day={day}
                            disabled={category.id === "hotel" && items.length > 0}
                            onComplex={() =>
                              setEditor({ dayId: day.id, type: category.defaultType })
                            }
                            tripId={trip.id}
                            variantId={workspace.variant.id}
                          />
                        ) : null}
                        {lastSelected && selectionAnchor.row === selectionEnd.row ? (
                          <button
                            aria-label="Fill selected cells down"
                            className="absolute -bottom-1 -right-1 z-20 size-3 cursor-crosshair rounded-[2px] border border-background bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onPointerDown={startFill}
                            type="button"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
        <div
          aria-label="Resize matrix and map"
          aria-orientation="vertical"
          aria-valuemax={68}
          aria-valuemin={45}
          aria-valuenow={Math.round(split)}
          className="planner-divider relative z-40 cursor-col-resize bg-border hover:bg-primary focus-visible:bg-primary focus-visible:outline-none"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") setSplit((value) => Math.max(45, value - 2));
            if (event.key === "ArrowRight") setSplit((value) => Math.min(68, value + 2));
          }}
          onPointerDown={startResize}
          role="separator"
          tabIndex={0}
        />
        <div className="planner-map-pane min-w-0">
          <div className="planner-map-landscape h-full">
            <MapShell
              markers={mapMarkers}
              onMarkerClick={selectMarker}
              onToggleKind={toggleMarkerKind}
              selectedId={selectedMapItem?.id}
              visibleKinds={visibleMarkerKinds}
            />
          </div>
          <div className="planner-map-peek h-full">
            <MapShell
              compact
              markers={mapMarkers}
              onExpand={() => setMapExpanded(true)}
              onMarkerClick={selectMarker}
              onToggleKind={toggleMarkerKind}
              selectedId={selectedMapItem?.id}
              visibleKinds={visibleMarkerKinds}
            />
          </div>
        </div>
      </div>
      <Sheet onOpenChange={(open) => !open && setEditor(null)} open={Boolean(editor)}>
        <SheetContent className="planner-editor-sheet">
          <SheetHeader>
            <SheetTitle>{editor?.item ? "Edit itinerary item" : "Add itinerary item"}</SheetTitle>
            <SheetDescription>
              <span className="sm:hidden">Add the details for this itinerary item.</span>
              <span className="hidden sm:inline">
                Press Enter to save, Tab to move between fields, or Escape to cancel.
              </span>
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-5">
            {editor ? (
              <PlannerItemForm
                dayId={editor.dayId}
                item={editor.item}
                onCancel={() => setEditor(null)}
                onError={setInteractionError}
                onSaved={() => setEditor(null)}
                tripId={trip.id}
                type={editor.type}
                unavailableTransportModes={unavailableTransportModes}
                variantId={workspace.variant.id}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet onOpenChange={setMapExpanded} open={mapExpanded}>
        <SheetContent className="planner-map-sheet h-[86dvh] max-h-none p-0" side="bottom">
          <SheetHeader className="py-4">
            <SheetTitle>{selectedMapItem?.title ?? "Itinerary map"}</SheetTitle>
            <SheetDescription>Saved places from your itinerary.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <MapShell
              markers={mapMarkers}
              onMarkerClick={selectMarker}
              onToggleKind={toggleMarkerKind}
              selectedId={selectedMapItem?.id}
              visibleKinds={visibleMarkerKinds}
            />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet onOpenChange={setSettingsOpen} open={settingsOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Trip settings</SheetTitle>
            <SheetDescription>
              Update trip details without changing the generated date structure.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-5">{settings}</div>
        </SheetContent>
      </Sheet>
      <Sheet onOpenChange={setCopyDaysOpen} open={copyDaysOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Copy to days</SheetTitle>
            <SheetDescription>
              Create independent copies on each selected destination day.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-2 overflow-y-auto p-5">
            {workspace.days.map((day) => (
              <label
                className={`flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm ${day.id === workspace.days[selectionBounds(selectionAnchor, selectionEnd).top]?.id ? "opacity-50" : ""}`}
                key={day.id}
              >
                <Checkbox
                  checked={
                    day.id ===
                    workspace.days[selectionBounds(selectionAnchor, selectionEnd).top]?.id
                      ? false
                      : targetDays.has(day.id)
                  }
                  disabled={
                    day.id ===
                    workspace.days[selectionBounds(selectionAnchor, selectionEnd).top]?.id
                  }
                  onCheckedChange={(checked) =>
                    setTargetDays((current) => {
                      const next = new Set(current);
                      if (checked) next.add(day.id);
                      else next.delete(day.id);
                      return next;
                    })
                  }
                />
                Day {day.day_number} · {day.date ? format(parseISO(day.date), "MMM d") : "Date TBD"}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t p-4">
            <Button onClick={() => setCopyDaysOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={!targetDays.size || copyMutation.isPending}
              onClick={copyToSelectedDays}
            >
              Copy items
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
