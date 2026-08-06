import { Bed, BusFront, CarFront, MapPin, NotebookText, Sparkles, Utensils } from "lucide-react";

import { PublicQuickActions } from "./public-quick-actions";
import { publicItemGroup } from "../presentation";
import type { PublicItineraryItem } from "../types";

const groupIcons = {
  "Car rental": CarFront,
  Plans: Sparkles,
  Transport: BusFront,
  Stay: Bed,
  Notes: NotebookText,
} as const;

export function PublicItemLine({
  compact = false,
  contextLabel,
  item,
  onSelect,
  selected = false,
  showIcon = true,
}: {
  compact?: boolean;
  contextLabel?: string;
  item: PublicItineraryItem;
  onSelect?: () => void;
  selected?: boolean;
  showIcon?: boolean;
}) {
  const group = publicItemGroup(item);
  const Icon =
    item.type === "meal" ? Utensils : item.type === "location" ? MapPin : groupIcons[group];
  const optionalTime = item.startTime?.slice(0, 5) ?? item.scheduleLabel;
  const rentalAction = item.carRental?.action
    ? item.carRental.action === "pickup"
      ? "Pickup"
      : "Return"
    : undefined;
  const title = rentalAction ?? item.title;
  const rentalLocation = item.place?.displayName;
  const rentalSummary =
    item.type === "car_rental"
      ? [item.carRental?.company, rentalLocation]
          .filter((value, index, values): value is string =>
            Boolean(value && values.findIndex((candidate) => candidate === value) === index),
          )
          .join(" · ")
      : "";
  const visibleAddress = item.carRental?.address ?? item.place?.address;
  return (
    <div
      aria-current={selected ? "true" : undefined}
      className={`${compact ? "" : "py-1.5"} public-item-focus flex ${onSelect ? "cursor-pointer" : "cursor-default"} items-start justify-between gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-primary/5" : ""}`}
      data-public-item-ref={item.ref}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      tabIndex={0}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2 text-sm">
          {showIcon ? (
            <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          ) : null}
          <div className="min-w-0">
            {contextLabel ? (
              <p className="mb-0.5 truncate text-[10px] font-semibold text-primary">
                {contextLabel}
              </p>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="min-w-0 truncate font-medium">{title}</span>
              {optionalTime ? (
                <span className="font-mono text-[10px] text-muted-foreground">{optionalTime}</span>
              ) : null}
            </div>
            {rentalSummary ? (
              <p className="mt-0.5 line-clamp-2 text-xs font-medium text-muted-foreground">
                {rentalSummary}
              </p>
            ) : null}
            {visibleAddress && visibleAddress !== rentalLocation ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{visibleAddress}</p>
            ) : null}
            {!compact && item.notes ? (
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                {item.notes}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <PublicQuickActions compact item={item} />
    </div>
  );
}
