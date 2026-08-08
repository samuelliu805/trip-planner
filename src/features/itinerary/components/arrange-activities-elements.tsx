"use client";

import { Bed, Clock3, ListOrdered } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ItineraryItem } from "@/features/itinerary/types";

type PointerIntent = {
  cancelled: boolean;
  pointerId: number;
  scrollTop: number;
  startY: number;
};

export function ActivityIdentity({ item }: { item: ItineraryItem }) {
  const time = (item.start_time ?? item.end_time)?.slice(0, 5);
  const anchorLabel = item.type === "hotel" ? "End of day" : time ? `${time} anchor` : null;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${anchorLabel ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}
      >
        {item.type === "hotel" ? (
          <Bed aria-hidden="true" className="size-4" />
        ) : time ? (
          <Clock3 aria-hidden="true" className="size-4" />
        ) : (
          <ListOrdered aria-hidden="true" className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.title}</p>
        <p className="text-xs text-muted-foreground">
          {anchorLabel ?? "Untimed · choose its position"}
        </p>
      </div>
    </div>
  );
}

export function ActivityInsertionGap({
  autoFocus,
  gapCount,
  index,
  onPlace,
  scrollContainer,
}: {
  autoFocus?: boolean;
  gapCount: number;
  index: number;
  onPlace: (index: number) => void;
  scrollContainer: React.RefObject<HTMLDivElement | null>;
}) {
  const intent = useRef<PointerIntent | null>(null);
  const confirmedPointerClick = useRef(false);
  const [pressed, setPressed] = useState(false);

  function cancelPointerIntent() {
    if (intent.current) intent.current.cancelled = true;
    confirmedPointerClick.current = false;
    setPressed(false);
  }

  useEffect(() => {
    if (!pressed) return;
    const container = scrollContainer.current;
    if (!container) return;
    const cancelForScroll = () => {
      if (intent.current) intent.current.cancelled = true;
      setPressed(false);
    };
    container.addEventListener("scroll", cancelForScroll, { passive: true });
    return () => container.removeEventListener("scroll", cancelForScroll);
  }, [pressed, scrollContainer]);

  return (
    <div className="relative z-10 h-3" role="presentation">
      <button
        aria-label="Click to place Activity here"
        autoFocus={autoFocus}
        className={`absolute left-0 top-1/2 flex h-11 w-full -translate-y-1/2 items-center justify-center px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring xl:h-9 ${pressed ? "text-primary" : "text-muted-foreground"}`}
        data-activity-gap={index}
        onClick={(event) => {
          if (event.detail === 0 || confirmedPointerClick.current) {
            confirmedPointerClick.current = false;
            onPlace(index);
          }
        }}
        onKeyDown={(event) => {
          const direction = ["ArrowDown", "ArrowRight"].includes(event.key)
            ? 1
            : ["ArrowUp", "ArrowLeft"].includes(event.key)
              ? -1
              : 0;
          const targetIndex =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? gapCount - 1
                : direction
                  ? Math.max(0, Math.min(gapCount - 1, index + direction))
                  : null;
          if (targetIndex === null || targetIndex === index) return;
          event.preventDefault();
          scrollContainer.current
            ?.querySelector<HTMLButtonElement>(`[data-activity-gap="${targetIndex}"]`)
            ?.focus();
        }}
        onPointerCancel={cancelPointerIntent}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          intent.current = {
            cancelled: false,
            pointerId: event.pointerId,
            scrollTop: scrollContainer.current?.scrollTop ?? 0,
            startY: event.clientY,
          };
          confirmedPointerClick.current = false;
          setPressed(true);
        }}
        onPointerMove={(event) => {
          const current = intent.current;
          if (!current || current.pointerId !== event.pointerId) return;
          if (
            Math.abs(event.clientY - current.startY) > 10 ||
            (scrollContainer.current?.scrollTop ?? 0) !== current.scrollTop
          )
            cancelPointerIntent();
        }}
        onPointerUp={(event) => {
          const current = intent.current;
          const shouldPlace =
            current?.pointerId === event.pointerId &&
            !current.cancelled &&
            Math.abs(event.clientY - current.startY) <= 10 &&
            (scrollContainer.current?.scrollTop ?? 0) === current.scrollTop;
          intent.current = null;
          setPressed(false);
          confirmedPointerClick.current = Boolean(shouldPlace);
        }}
        style={{ touchAction: "pan-y" }}
        type="button"
      >
        <span className="absolute inset-x-2 top-1/2 border-t border-dashed border-current" />
        <span className="relative rounded-full bg-background px-2 text-[10px] font-medium">
          Click to place
        </span>
      </button>
    </div>
  );
}
