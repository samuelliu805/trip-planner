import { Bed, MapPin, NotebookText, Sparkles, Utensils } from "lucide-react";

import { PublicQuickActions } from "./public-quick-actions";
import type { PublicItineraryItem } from "../types";

export function PublicItemLine({
  compact = false,
  item,
  onSelect,
  selected = false,
  showIcon = true,
}: {
  compact?: boolean;
  item: PublicItineraryItem;
  onSelect: () => void;
  selected?: boolean;
  showIcon?: boolean;
}) {
  const Icon =
    item.type === "meal"
      ? Utensils
      : item.type === "location"
        ? MapPin
        : item.type === "hotel"
          ? Bed
          : item.type === "note"
            ? NotebookText
            : Sparkles;
  const optionalTime = item.startTime?.slice(0, 5) ?? item.scheduleLabel;
  const visibleAddress = item.place?.address;
  return (
    <div
      aria-current={selected ? "true" : undefined}
      className={`${compact ? "" : "py-1.5"} public-item-focus flex cursor-pointer items-start justify-between gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-primary/5" : ""}`}
      data-public-item-ref={item.ref}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
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
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="min-w-0 truncate font-medium">{item.title}</span>
              {optionalTime ? (
                <span className="font-mono text-[10px] text-muted-foreground">{optionalTime}</span>
              ) : null}
            </div>
            {visibleAddress ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{visibleAddress}</p>
            ) : null}
            {item.notes ? (
              <p
                className={`${compact ? "line-clamp-2" : "whitespace-pre-wrap"} mt-1 text-xs leading-5 text-muted-foreground`}
              >
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
