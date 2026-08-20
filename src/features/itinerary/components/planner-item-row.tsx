"use client";

import { MoreHorizontal, Paperclip, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  normalizeTransportMode,
  type CarRentalDetails,
  type ItineraryItem,
} from "@/features/itinerary/types";
import { MatrixItemSummary } from "@/features/itinerary/components/matrix-presentation";
import { formatMoney } from "@/features/research/money";
import { compactTransportRoute } from "@/features/itinerary/transport-presentation";

export function PlannerItemRow({
  interactive,
  item,
  onDelete,
  onEdit,
  onSelect,
  selected,
}: {
  interactive: boolean;
  item: ItineraryItem;
  onDelete: (item: ItineraryItem) => void;
  onEdit: (item: ItineraryItem) => void;
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
  const car = item.type === "car_rental" ? (details as CarRentalDetails) : null;
  const carSummary = car ? [car.provider, car.address].filter(Boolean).join(" · ") : "";
  const placeSummary = car
    ? ""
    : (item.place?.formattedAddress ?? details.address ?? details.location ?? "");
  const routeSummary = compactTransportRoute(details.origin, details.destination);
  const priceSummary =
    item.price_amount !== null && item.price_currency
      ? formatMoney(item.price_amount, item.price_currency)
      : "";
  const subtitle =
    item.type === "activity"
      ? ""
      : [routeSummary, details.serviceNumber, carSummary, placeSummary, priceSummary]
          .filter(Boolean)
          .join(" · ");
  const title = item.title;
  return (
    <div
      className={`group/item grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center rounded ${selected ? "bg-primary/10 ring-1 ring-primary/40" : interactive ? "hover:bg-muted/70" : ""}`}
    >
      <button
        className="flex min-h-8 min-w-0 flex-col justify-center rounded px-1.5 py-0.5 text-left text-sm leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        tabIndex={interactive ? 0 : -1}
        type="button"
      >
        <MatrixItemSummary
          startTime={start}
          subtitle={subtitle}
          title={title}
          transportMode={mode}
          type={item.type}
        />
      </button>
      {item.attachments?.some(({ status }) => status === "ready") ? (
        <span
          aria-label={`${item.attachments.filter(({ status }) => status === "ready").length} attachments`}
          className="mr-0.5 inline-flex h-8 shrink-0 items-center gap-0.5 self-center text-[10px] leading-none text-muted-foreground"
          title={`${item.attachments.filter(({ status }) => status === "ready").length} attachments`}
        >
          <Paperclip aria-hidden="true" className="size-3" />
          {item.attachments.filter(({ status }) => status === "ready").length}
        </span>
      ) : null}
      {interactive ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`Actions for ${title}`}
              className="flex size-8 shrink-0 items-center justify-center self-center rounded hover:bg-background"
              onClick={(event) => event.stopPropagation()}
              type="button"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(item)}>Edit item</DropdownMenuItem>
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
