import { Bed, Sparkles, Utensils } from "lucide-react";

import type { PublicItineraryItem } from "../types";
import { PublicItemLine } from "./public-item-line";

function DestinationIcon({ type }: { type: PublicItineraryItem["type"] }) {
  const className = "size-3.5";
  if (type === "hotel") return <Bed className={className} />;
  if (type === "meal") return <Utensils className={className} />;
  return <Sparkles className={className} />;
}

export function PublicTimelineDestinations({
  dayRef,
  items,
  onSelectItem,
  selectedItemRef,
}: {
  dayRef: string;
  items: PublicItineraryItem[];
  onSelectItem: (itemRef: string, dayRef: string) => void;
  selectedItemRef?: string;
}) {
  if (!items.length) return <p className="py-2 text-xs text-muted-foreground">No shared plans.</p>;

  return (
    <ol className="relative before:absolute before:bottom-5 before:left-[0.98rem] before:top-5 before:w-px before:bg-primary/25">
      {items.map((item) => (
        <li
          className="public-timeline-item relative grid grid-cols-[2rem_minmax(0,1fr)] gap-2 py-2"
          key={item.ref}
        >
          <span
            aria-hidden="true"
            className="relative z-10 mt-1 flex size-8 items-center justify-center border border-primary/30 bg-background text-primary"
          >
            <DestinationIcon type={item.type} />
          </span>
          <div className="min-w-0 border-b pb-2 last:border-b-0">
            <PublicItemLine
              item={item}
              onSelect={() => onSelectItem(item.ref, dayRef)}
              selected={selectedItemRef === item.ref}
              showIcon={false}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
