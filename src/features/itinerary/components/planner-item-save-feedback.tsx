"use client";

import { ArrowUpRight, CircleAlert, CircleCheckBig, X } from "lucide-react";
import { createPortal } from "react-dom";

import type { ItineraryItem } from "@/features/itinerary/types";

export type PlannerItemSaveFeedback =
  | { item: ItineraryItem; itemLabel: string; showViewLink: boolean; status: "created" }
  | { itemLabel: string; itemTitle: string; message: string; status: "error" };

export function PlannerItemSaveFeedbackAlert({
  feedback,
  onDismiss,
  onView,
}: {
  feedback?: PlannerItemSaveFeedback;
  onDismiss: () => void;
  onView: (item: ItineraryItem) => void;
}) {
  if (!feedback || typeof document === "undefined") return null;
  const success = feedback.status === "created";

  return createPortal(
    <div className="pointer-events-none fixed left-1/2 top-4 z-[150] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2">
      <div
        aria-live={success ? "polite" : "assertive"}
        className={`pointer-events-auto rounded-xl border bg-background p-4 shadow-2xl sm:p-5 ${
          success ? "border-primary/50 ring-4 ring-primary/10" : "border-destructive/50"
        }`}
        role={success ? "status" : "alert"}
      >
        <div className="flex min-w-0 items-start gap-3">
          {success ? (
            <CircleCheckBig aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary" />
          ) : (
            <CircleAlert aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-destructive" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {success
                ? `${feedback.itemLabel} “${feedback.item.title}” was created.`
                : `${feedback.itemLabel} “${feedback.itemTitle}” was not created.`}
            </p>
            {success && feedback.showViewLink ? (
              <button
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onView(feedback.item)}
                type="button"
              >
                View and focus in planner <ArrowUpRight aria-hidden="true" className="size-4" />
              </button>
            ) : !success ? (
              <p className="mt-1 text-sm text-destructive">{feedback.message}</p>
            ) : null}
          </div>
          <button
            aria-label="Dismiss message"
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onDismiss}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
