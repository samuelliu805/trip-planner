import { CarFront, Route } from "lucide-react";

import { isPublicTransfer, publicRentalItemLabel, publicTransferItemLabel } from "../presentation";
import type { PublicItineraryItem } from "../types";

export function PublicTransportRow({ items }: { items: PublicItineraryItem[] }) {
  if (!items.length) return null;
  const transfers = items.filter(isPublicTransfer).map(publicTransferItemLabel).join(", ");
  const rentals = items
    .filter(({ type }) => type === "car_rental")
    .map(publicRentalItemLabel)
    .join(", ");

  return (
    <section aria-label="Transport" className="mt-1 space-y-1 border-t py-2">
      {transfers ? (
        <div className="flex min-w-0 items-center gap-2">
          <Route aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="sr-only">Transport:</span>
          <p
            className="min-w-0 flex-1 truncate whitespace-nowrap text-xs font-medium leading-5 text-foreground"
            title={transfers}
          >
            {transfers}
          </p>
        </div>
      ) : null}
      {rentals ? (
        <div className="flex min-w-0 items-center gap-2">
          <CarFront aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="sr-only">Rental car:</span>
          <p
            className="min-w-0 flex-1 truncate whitespace-nowrap text-xs leading-5 text-muted-foreground"
            title={rentals}
          >
            {rentals}
          </p>
        </div>
      ) : null}
    </section>
  );
}
