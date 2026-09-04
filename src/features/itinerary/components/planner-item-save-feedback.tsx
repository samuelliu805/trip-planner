"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { ArrowUpRight, CircleAlert, CircleCheckBig } from "lucide-react";
import { createPortal } from "react-dom";

import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
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
  const { t } = useI18n();
  if (!feedback || typeof document === "undefined") return null;
  const success = feedback.status === "created";

  return createPortal(
    <div className="pointer-events-none fixed left-1/2 top-4 z-[150] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2">
      <AutoDismissAlert
        className={`pointer-events-auto rounded-xl p-4 shadow-2xl sm:p-5 ${success ? "ring-4 ring-primary/10" : ""}`}
        onDismiss={onDismiss}
        role={success ? "status" : "alert"}
        tone={success ? "success" : "destructive"}
        value={feedback}
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
                ? t("{item} “{title}” was created.", {
                    item: t(feedback.itemLabel),
                    title:
                      feedback.item.type === "car_rental"
                        ? t(feedback.item.title)
                        : feedback.item.title,
                  })
                : t("{item} “{title}” was not created.", {
                    item: t(feedback.itemLabel),
                    title: feedback.itemTitle,
                  })}
            </p>
            {success && feedback.showViewLink ? (
              <button
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onView(feedback.item)}
                type="button"
              >
                <T message={" View and focus in planner "} />
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </button>
            ) : !success ? (
              <p className="mt-1 text-sm text-destructive">
                <Localized value={feedback.message} />
              </p>
            ) : null}
          </div>
        </div>
      </AutoDismissAlert>
    </div>,
    document.body,
  );
}
