import { Localized, T } from "@/features/i18n/i18n-provider";
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
  type,
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
      <span
        className={`flex min-w-0 items-center gap-1.5 ${transportMode ? "matrix-transport-summary flex-wrap" : ""}`}
      >
        {ModeIcon ? <ModeIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
        {startTime ? (
          <span className="shrink-0 font-mono text-[13px] leading-[1.35] text-muted-foreground min-[1200px]:text-[11px]">
            {startTime.slice(0, 5)}
          </span>
        ) : null}
        <span
          className={
            transportMode
              ? "matrix-transport-mode-label shrink-0 whitespace-nowrap font-medium text-[15px] leading-[1.25] min-[1200px]:text-[13px]"
              : type === "location"
                ? "whitespace-normal break-words text-[15px] font-medium leading-[1.25] min-[1200px]:text-[13px]"
                : "truncate text-[15px] font-medium leading-[1.25] min-[1200px]:text-[13px]"
          }
        >
          {transportMode ? <Localized value={transportModeLabels[transportMode]} /> : title}
        </span>
      </span>
      {subtitle ? (
        <span
          className="block truncate text-[13px] leading-[1.35] text-muted-foreground min-[1200px]:text-[11px]"
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
  wideDateColumn = false,
}: {
  columns?: MatrixCategoryColumn[];
  mobileDateLabel?: string;
  wideDateColumn?: boolean;
}) {
  return (
    <div
      className="matrix-grid-header sticky top-0 z-[70] flex h-9 border-b bg-muted text-[13px] font-semibold leading-[1.35] text-muted-foreground min-[1200px]:h-10 min-[1200px]:text-[11px]"
      role="row"
    >
      <div
        className={`matrix-date-column sticky left-0 top-0 z-20 flex shrink-0 items-center border-r bg-muted px-2 ${wideDateColumn ? "w-28" : "w-24"}`}
        role="columnheader"
      >
        <span className="matrix-frozen-content">
          {mobileDateLabel ? (
            <>
              <span className="sm:hidden">{mobileDateLabel}</span>
              <span className="hidden sm:inline">
                <T message={"Date"} />
              </span>
            </>
          ) : (
            <T message="Date" />
          )}
        </span>
      </div>
      <div
        className={`matrix-day-column sticky z-10 flex w-16 shrink-0 items-center border-r bg-muted px-2 ${wideDateColumn ? "left-28" : "left-24"}`}
        role="columnheader"
      >
        <span className="matrix-frozen-content">
          <T message={" Day "} />
        </span>
      </div>
      {columns.map((column) => (
        <div
          className={`${column.width} flex shrink-0 items-center border-r px-2`}
          key={column.id}
          role="columnheader"
        >
          <Localized value={column.label} />
        </div>
      ))}
    </div>
  );
}
