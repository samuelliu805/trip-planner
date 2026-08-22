"use client";

import { Check, ListOrdered } from "lucide-react";

import { compareActivityOrder, isDestinationActivity } from "@/features/itinerary/activity-order";
import { itemCopy } from "@/features/itinerary/components/planner-item-form-config";
import type {
  CarRentalDetails,
  ItineraryItem,
  ItineraryItemType,
} from "@/features/itinerary/types";

function OrderGap({
  active,
  activeLabel,
  anchor,
  onChange,
}: {
  active: boolean;
  activeLabel: string;
  anchor: string | null;
  onChange: (anchor: string | null) => void;
}) {
  return (
    <button
      aria-pressed={active}
      className="group relative flex min-h-11 w-full items-center justify-center px-2 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      onClick={() => onChange(anchor)}
      type="button"
    >
      <span className="absolute inset-x-2 top-1/2 border-t border-dashed border-current" />
      <span
        className={`relative flex items-center gap-1 rounded-full px-2.5 py-1 ${active ? "bg-primary text-primary-foreground" : "bg-background group-hover:text-primary"}`}
      >
        {active ? <Check aria-hidden="true" className="size-3" /> : null}
        {active ? activeLabel : "Move here"}
      </span>
    </button>
  );
}

export function PlannerItemOrderField({
  carAction,
  insertAfterItemId,
  item,
  items,
  onChange,
  placeName,
  title,
  type,
}: {
  carAction: CarRentalDetails["action"];
  insertAfterItemId: string | null;
  item?: ItineraryItem;
  items: ItineraryItem[];
  onChange: (itemId: string | null) => void;
  placeName?: string;
  title: string;
  type: ItineraryItemType;
}) {
  const ordered = items
    .filter((entry) => entry.id !== item?.id && isDestinationActivity(entry))
    .sort(compareActivityOrder);
  const displayName =
    title.trim() || placeName || item?.title || `New ${itemCopy[type].label.toLowerCase()}`;
  const selectedPositionLabel = type === "car_rental" ? `Rental ${carAction}` : displayName;
  const label = type === "car_rental" ? selectedPositionLabel : displayName;

  if (type === "hotel")
    return (
      <div className="space-y-3">
        <div className="flex min-h-14 items-center gap-3 rounded-md border bg-primary/5 px-3 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ListOrdered aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{label}</p>
            <p className="text-xs text-muted-foreground">Hotels stay at the end of the day.</p>
          </div>
        </div>
      </div>
    );

  return (
    <div className="min-w-0">
      <div className="mb-2 flex min-h-14 items-center gap-3 rounded-md border bg-primary/5 px-3 py-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ListOrdered aria-hidden="true" className="size-4" />
        </span>
        <p className="min-w-0 truncate text-sm font-semibold">Moving {label}</p>
      </div>
      <div className="rounded-md border bg-background px-2 py-1">
        <OrderGap
          active={insertAfterItemId === null}
          activeLabel={selectedPositionLabel}
          anchor={null}
          onChange={onChange}
        />
        {ordered.map((entry) => (
          <div key={entry.id}>
            <div className="flex min-h-12 items-center rounded-md border bg-muted/20 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{entry.title}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {itemCopy[entry.type].label}
                </p>
              </div>
            </div>
            {entry.type !== "hotel" ? (
              <OrderGap
                active={insertAfterItemId === entry.id}
                activeLabel={selectedPositionLabel}
                anchor={entry.id}
                onChange={onChange}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
