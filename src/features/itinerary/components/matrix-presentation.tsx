import {
  Bike,
  BusFront,
  CableCar,
  CarFront,
  CarTaxiFront,
  Footprints,
  Plane,
  Ship,
  TrainFront,
  TramFront,
  type LucideIcon,
} from "lucide-react";

import {
  transportModeLabels,
  type ItineraryItemType,
  type TransportMode,
} from "@/features/itinerary/types";

import { matrixCategoryColumns, type MatrixCategoryColumn } from "./matrix-columns";

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

export function MatrixItemSummary({
  startTime,
  subtitle,
  title,
  transportMode,
}: {
  startTime?: string | null;
  subtitle?: string;
  title: string;
  transportMode?: TransportMode | null;
  type?: ItineraryItemType;
}) {
  const ModeIcon = transportMode ? (transportModeIcons[transportMode] ?? CarFront) : null;
  return (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        {ModeIcon ? (
          <ModeIcon className="size-4 shrink-0 text-muted-foreground sm:size-3.5" />
        ) : null}
        {startTime ? (
          <span className="shrink-0 font-mono text-xs text-muted-foreground sm:text-[10px]">
            {startTime.slice(0, 5)}
          </span>
        ) : null}
        <span className="truncate font-medium">
          {transportMode ? transportModeLabels[transportMode] : title}
        </span>
      </span>
      {subtitle ? (
        <span
          className="block truncate text-xs leading-4 text-muted-foreground sm:mt-0.5 sm:text-[10px] sm:leading-normal"
          title={subtitle}
        >
          {subtitle}
        </span>
      ) : null}
    </>
  );
}

export function MatrixGridHeader({
  columns = matrixCategoryColumns,
  mobileDateLabel,
}: {
  columns?: MatrixCategoryColumn[];
  mobileDateLabel?: string;
}) {
  return (
    <div
      className="matrix-grid-header sticky top-0 z-40 flex h-10 border-b bg-muted/95 text-xs font-semibold text-muted-foreground sm:h-9 sm:text-[11px]"
      role="row"
    >
      <div
        className="matrix-date-column sticky left-0 top-0 z-20 flex w-24 shrink-0 items-center border-r bg-muted px-2"
        role="columnheader"
      >
        {mobileDateLabel ? (
          <>
            <span className="sm:hidden">{mobileDateLabel}</span>
            <span className="hidden sm:inline">Date</span>
          </>
        ) : (
          "Date"
        )}
      </div>
      <div
        className="matrix-day-column sticky left-24 z-10 flex w-16 shrink-0 items-center border-r bg-muted px-2"
        role="columnheader"
      >
        Day
      </div>
      {columns.map((column) => (
        <div
          className={`${column.width} flex shrink-0 items-center border-r px-2`}
          key={column.id}
          role="columnheader"
        >
          {column.label}
        </div>
      ))}
    </div>
  );
}
