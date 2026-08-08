"use client";

import { Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ActivityIdentity,
  ActivityInsertionGap,
} from "@/features/itinerary/components/arrange-activities-elements";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  canonicalActivityOrderIds,
  isActivityOrderAnchor,
  orderedDestinationActivities,
  placeActivityAtGap,
  sameActivityOrder,
} from "@/features/itinerary/activity-order";
import type { PlannerDay } from "@/features/itinerary/types";

export function ArrangeActivitiesSheet({
  day,
  initialMovingItemId,
  onCommit,
  onInitialPlacementComplete,
  onOpenChange,
  open,
  pending,
}: {
  day?: PlannerDay;
  initialMovingItemId?: string;
  onCommit: (day: PlannerDay, orderedItemIds: string[]) => Promise<boolean>;
  onInitialPlacementComplete?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
}) {
  const [movingItemId, setMovingItemId] = useState<string | undefined>(initialMovingItemId);
  const [undoOrder, setUndoOrder] = useState<string[]>();
  const [announcement, setAnnouncement] = useState("");
  const scrollContainer = useRef<HTMLDivElement>(null);
  const ordered = orderedDestinationActivities(day?.items ?? []);
  const movingItem = ordered.find(({ id }) => id === movingItemId);
  const remaining = movingItemId ? ordered.filter(({ id }) => id !== movingItemId) : ordered;
  const movableCount = ordered.filter((item) => !isActivityOrderAnchor(item)).length;
  const initialPlacementActive = Boolean(
    initialMovingItemId && movingItemId === initialMovingItemId,
  );
  const currentGapIndex = movingItem ? ordered.findIndex(({ id }) => id === movingItem.id) : 0;
  const gapCount = remaining.filter(({ type }) => type !== "hotel").length + 1;

  function finishInitialPlacement(message: string) {
    setMovingItemId(undefined);
    setAnnouncement(message);
    onInitialPlacementComplete?.();
  }

  useEffect(() => {
    if (!movingItemId) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (initialMovingItemId && movingItemId === initialMovingItemId) {
        onInitialPlacementComplete?.();
        return;
      }
      setMovingItemId(undefined);
      setAnnouncement("Activity move cancelled");
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [initialMovingItemId, movingItemId, onInitialPlacementComplete]);

  async function place(index: number) {
    if (!day || !movingItemId || pending) return;
    const before = canonicalActivityOrderIds(day.items);
    const next = placeActivityAtGap(day.items, movingItemId, index, initialPlacementActive);
    if (sameActivityOrder(before, next)) {
      if (initialPlacementActive) finishInitialPlacement("Activity kept in its current position");
      else {
        setMovingItemId(undefined);
        setAnnouncement("Activity already in that position");
      }
      return;
    }
    if (!(await onCommit(day, next))) return;
    setUndoOrder(before);
    if (initialPlacementActive) finishInitialPlacement("Activity placed");
    else {
      setMovingItemId(undefined);
      setAnnouncement("Activity moved");
    }
  }

  async function undo() {
    if (!day || !undoOrder || pending) return;
    if (await onCommit(day, undoOrder)) {
      setUndoOrder(undefined);
      setAnnouncement("Activity move undone");
    }
  }

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setMovingItemId(undefined);
          setUndoOrder(undefined);
          setAnnouncement("");
        }
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <SheetContent className="w-full p-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {initialPlacementActive && movingItem
              ? `Click to place ${movingItem.title}`
              : `Arrange Day ${day?.day_number ?? ""} Activities`}
          </SheetTitle>
          <SheetDescription>
            {initialPlacementActive
              ? `Choose this new item’s position in Day ${day?.day_number ?? ""}. Click a gap, or use Arrow keys to move between gaps and Enter to place.`
              : "Select an untimed Activity, then click a gap. Use Arrow keys to move between gaps and Enter to place."}{" "}
            Timed items stay anchored and Hotel stays last. Transport stays in its separate section.
          </SheetDescription>
        </SheetHeader>

        {movingItem ? (
          <div className="sticky top-0 z-20 border-y bg-background/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Moving {movingItem.title}</p>
                <p className="text-xs text-muted-foreground">
                  Click a gap to place it · swipe or scroll safely
                </p>
              </div>
              <Button
                className="min-h-11 shrink-0 xl:min-h-9"
                onClick={() => {
                  if (initialPlacementActive)
                    finishInitialPlacement("Activity kept in its current position");
                  else {
                    setMovingItemId(undefined);
                    setAnnouncement("Activity move cancelled");
                  }
                }}
                variant="ghost"
              >
                {initialPlacementActive ? "Keep current" : "Cancel"}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5" ref={scrollContainer}>
          {movingItem ? (
            <>
              <ActivityInsertionGap
                autoFocus={currentGapIndex === 0}
                gapCount={gapCount}
                index={0}
                onPlace={(index) => void place(index)}
                scrollContainer={scrollContainer}
              />
              {remaining.map((item, index) => (
                <div key={item.id}>
                  <div className="flex min-h-16 items-center rounded-md border bg-background px-3 py-2">
                    <ActivityIdentity item={item} />
                  </div>
                  {item.type !== "hotel" ? (
                    <ActivityInsertionGap
                      autoFocus={currentGapIndex === index + 1}
                      gapCount={gapCount}
                      index={index + 1}
                      onPlace={(gap) => void place(gap)}
                      scrollContainer={scrollContainer}
                    />
                  ) : null}
                </div>
              ))}
            </>
          ) : ordered.length ? (
            <div className="space-y-2">
              {ordered.map((item) => {
                const anchored = isActivityOrderAnchor(item);
                return anchored ? (
                  <div
                    className="flex min-h-16 w-full items-center rounded-md border bg-muted/20 px-3 py-2"
                    key={item.id}
                  >
                    <ActivityIdentity item={item} />
                    <span className="text-xs font-medium text-muted-foreground">Fixed</span>
                  </div>
                ) : (
                  <button
                    className="flex min-h-16 w-full items-center rounded-md border bg-background px-3 py-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={pending}
                    key={item.id}
                    onClick={() => {
                      setMovingItemId(item.id);
                      setUndoOrder(undefined);
                      setAnnouncement(`Moving ${item.title}. Click a gap to place it.`);
                    }}
                    type="button"
                  >
                    <ActivityIdentity item={item} />
                    <span className="text-xs font-medium text-primary">Choose position</span>
                  </button>
                );
              })}
              {!movableCount ? (
                <p className="px-1 pt-2 text-sm text-muted-foreground">
                  Add an untimed Activity or Meal to choose a manual position.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Add Activities to this Day first.</p>
          )}
        </div>

        <div className="flex min-h-14 items-center justify-between gap-3 border-t px-4 py-2">
          <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
            {announcement}
          </p>
          {undoOrder ? (
            <Button disabled={pending} onClick={() => void undo()} variant="ghost">
              <Undo2 aria-hidden="true" className="size-4" /> Undo
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
