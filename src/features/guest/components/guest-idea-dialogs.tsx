"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { T } from "@/features/i18n/i18n-provider";
import { addIsoDateDays } from "@/features/research/date-range";
import { guestIdeaRelevantDates } from "../apply-idea";
import { guestIdeaJourneys } from "../idea-journeys";
import type { GuestTripDraft } from "../schema";

export function GuestIdeaDialogs({
  draft,
  reviewId,
  deleteId,
  error,
  onApply,
  onDelete,
  onReviewChange,
  onDeleteChange,
}: {
  draft: GuestTripDraft;
  reviewId?: string;
  deleteId?: string;
  error?: string;
  onApply: () => void;
  onDelete: (id: string) => void;
  onReviewChange: (id?: string) => void;
  onDeleteChange: (id?: string) => void;
}) {
  const reviewing = draft.ideas.find((idea) => idea.id === reviewId);
  let journeys: ReturnType<typeof guestIdeaJourneys> = [];
  let reviewError: string | undefined;
  if (reviewing) {
    try {
      journeys = guestIdeaJourneys(reviewing);
    } catch (cause) {
      reviewError = cause instanceof Error ? cause.message : "Review the flight routes.";
    }
  }
  const dates = reviewing && !reviewError ? guestIdeaRelevantDates(reviewing) : [];
  const planStart = draft.trip.start_date;
  const planEnd = draft.trip.end_date;
  const newStart = [planStart, dates[0]].filter(Boolean).sort()[0] ?? null;
  const minimumEnd =
    !planStart && newStart ? addIsoDateDays(newStart, draft.workspace.days.length - 1) : null;
  const newEnd = [planEnd, dates.at(-1), minimumEnd].filter(Boolean).sort().at(-1) ?? null;
  return (
    <>
      <Dialog
        open={Boolean(reviewId)}
        onOpenChange={(open) => {
          if (!open) onReviewChange();
        }}
      >
        <DialogContent className="max-w-full overflow-x-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <T message="Add to Plan" />
            </DialogTitle>
            <DialogDescription>
              <T message="Review the items and dates this idea will add." />
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55dvh] space-y-3 overflow-y-auto px-5 py-4 sm:px-6">
            {journeys.map((journey, index) => (
              <div className="rounded-lg border p-3" key={index}>
                <p className="font-medium">
                  {journey.origin && journey.destination
                    ? `${journey.origin} → ${journey.destination}`
                    : reviewing?.values.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {journey.departureDate ?? "Day 1"}
                  {journey.arrivalDate && journey.arrivalDate !== journey.departureDate
                    ? ` – ${journey.arrivalDate}`
                    : ""}
                </p>
              </div>
            ))}
            {newStart && newEnd ? (
              <p className="text-sm">
                <T message="Trip dates" />:{" "}
                {planStart && planEnd ? `${planStart} – ${planEnd} → ` : ""}
                {newStart} – {newEnd}
              </p>
            ) : null}
            {reviewError || error ? (
              <p className="text-sm text-destructive" role="alert">
                {reviewError ?? error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => onReviewChange()} variant="outline">
              <T message="Cancel" />
            </Button>
            <Button disabled={Boolean(reviewError)} onClick={onApply}>
              <T message="Add to Plan" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) onDeleteChange();
        }}
      >
        <DialogContent className="max-w-full overflow-x-hidden sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              <T message="Delete idea?" />
            </DialogTitle>
            <DialogDescription>
              <T message="The Plan stays unchanged." />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onDeleteChange()} variant="outline">
              <T message="Cancel" />
            </Button>
            <Button
              onClick={() => {
                if (deleteId) onDelete(deleteId);
                onDeleteChange();
              }}
              variant="destructive"
            >
              <T message="Delete" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
