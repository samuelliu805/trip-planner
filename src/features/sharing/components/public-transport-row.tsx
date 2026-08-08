import { CarFront, Route } from "lucide-react";

import { isPublicTransfer, publicRentalItemLabel, publicTransferItemLabel } from "../presentation";
import type { PublicItineraryItem } from "../types";
import { PublicOverviewIcon } from "./public-overview-icon";

function hasMapLocation(item: PublicItineraryItem) {
  return typeof item.place?.latitude === "number" && typeof item.place.longitude === "number";
}

function RentalSummary({
  item,
  onSelectItem,
  selected,
}: {
  item: PublicItineraryItem;
  onSelectItem: (itemRef: string) => void;
  selected: boolean;
}) {
  const label = publicRentalItemLabel(item);
  if (!hasMapLocation(item)) return <>{label}</>;
  return (
    <button
      aria-current={selected ? "location" : undefined}
      aria-label={`Focus map on ${label}`}
      className={`font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "text-primary underline" : "text-foreground"}`}
      data-public-item-ref={item.ref}
      onClick={() => onSelectItem(item.ref)}
      type="button"
    >
      {label}
    </button>
  );
}

export function PublicTransportRow({
  items,
  onSelectItem,
  selectedItemRef,
}: {
  items: PublicItineraryItem[];
  onSelectItem: (itemRef: string) => void;
  selectedItemRef?: string;
}) {
  if (!items.length) return null;
  const transfers = items.filter(isPublicTransfer).map(publicTransferItemLabel).join(", ");
  const rentals = items.filter(({ type }) => type === "car_rental");
  const rentalLabel = rentals.map(publicRentalItemLabel).join(", ");

  return (
    <section aria-label="Transport" className="mt-1 space-y-1 border-t py-2">
      {transfers ? (
        <div className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-2">
          <PublicOverviewIcon icon={Route} muted />
          <p
            className="min-w-0 flex-1 truncate whitespace-nowrap text-sm font-medium leading-5 text-foreground"
            title={transfers}
          >
            <span className="sr-only">Transport:</span>
            {transfers}
          </p>
        </div>
      ) : null}
      {rentals.length ? (
        <div className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-2">
          <PublicOverviewIcon icon={CarFront} muted />
          <p
            className="min-w-0 flex-1 truncate whitespace-nowrap text-sm font-medium leading-5 text-foreground"
            title={rentalLabel}
          >
            {rentals.map((item, index) => (
              <span key={item.ref}>
                {index ? ", " : null}
                <RentalSummary
                  item={item}
                  onSelectItem={onSelectItem}
                  selected={selectedItemRef === item.ref}
                />
              </span>
            ))}
          </p>
        </div>
      ) : null}
    </section>
  );
}
