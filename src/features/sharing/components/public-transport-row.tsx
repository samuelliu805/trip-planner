import { publicTransportItemLabel } from "../presentation";
import type { PublicItineraryItem } from "../types";

export function PublicTransportRow({ items }: { items: PublicItineraryItem[] }) {
  if (!items.length) return null;
  const fullLabel = items.map(publicTransportItemLabel).join(", ");

  return (
    <section
      aria-label="Transport"
      className="mt-1 flex min-w-0 items-baseline gap-2 overflow-hidden border-t py-2"
    >
      <h3 className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Transport
      </h3>
      <p
        className="min-w-0 flex-1 truncate whitespace-nowrap text-xs font-medium leading-5 text-foreground"
        title={fullLabel}
      >
        {fullLabel}
      </p>
    </section>
  );
}
