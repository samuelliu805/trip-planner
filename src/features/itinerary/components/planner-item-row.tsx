"use client";

import {
  Bike,
  BusFront,
  CableCar,
  CarFront,
  CarTaxiFront,
  Footprints,
  MoreHorizontal,
  Plane,
  Ship,
  TrainFront,
  TramFront,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  normalizeTransportMode,
  transportModeLabels,
  type CarRentalDetails,
  type ItineraryItem,
  type TransportMode,
} from "@/features/itinerary/types";

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

export function PlannerItemRow({
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
  const start = item.start_time ? item.start_time.slice(0, 5) : null;
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
