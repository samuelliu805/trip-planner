"use client";

import { ChevronDown, Hotel } from "lucide-react";

import { DeltaChip } from "@/features/variants/components/decision-summary-card-elements";
import { formatHotelAlignmentLabel } from "@/features/variants/decision-summary-presentation";
import type { VariantDecisionSummary } from "@/features/variants/decision-summary-types";

function HotelDifferenceEntries({ summary }: { summary: VariantDecisionSummary }) {
  const difference = summary.hotelDifference;
  if (!difference) return null;
  return (
    <>
      <div className="flex flex-wrap gap-1">
        <span className="rounded-full border px-2 py-0.5">{difference.same} same</span>
        <span className="rounded-full border px-2 py-0.5">{difference.changed} changed</span>
        <span className="rounded-full border px-2 py-0.5">{difference.added} added</span>
        <span className="rounded-full border px-2 py-0.5">{difference.removed} removed</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <DeltaChip kind="Hotel changed" value={summary.deltas?.hotelChanged} />
        <DeltaChip kind="Hotel added" value={summary.deltas?.hotelAdded} />
        <DeltaChip kind="Hotel removed" value={summary.deltas?.hotelRemoved} />
      </div>
      {difference.entries.length ? (
        <ul className="space-y-1.5">
          {difference.entries.map((entry, index) => (
            <li className="rounded-md bg-muted/50 p-2" key={entry.alignmentLabel + index}>
              <span className="font-medium capitalize">{entry.status}</span>
              {" · "}
              {formatHotelAlignmentLabel(entry.alignmentLabel)}
              <span className="block text-muted-foreground">
                {entry.status === "changed"
                  ? (entry.primary?.title ?? "Hotel") + " → " + (entry.compared?.title ?? "Hotel")
                  : (entry.compared?.title ?? entry.primary?.title ?? "Hotel")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No Hotel occurrences in either route.</p>
      )}
    </>
  );
}

function PrimaryHotelOccurrences({ summary }: { summary: VariantDecisionSummary }) {
  return summary.hotelOccurrences.length ? (
    <ul className="space-y-1">
      {summary.hotelOccurrences.map((hotel) => (
        <li className="rounded-md bg-muted/50 p-2" key={hotel.itemId}>
          {hotel.title} ·{" "}
          {hotel.date ? formatHotelAlignmentLabel(hotel.date) : "Day " + hotel.dayNumber}
        </li>
      ))}
    </ul>
  ) : (
    <p>No explicit Hotel occurrences.</p>
  );
}

export function DecisionSummaryHotelDetails({ summary }: { summary: VariantDecisionSummary }) {
  const difference = summary.hotelDifference;
  const differenceLabel = difference
    ? difference.changed +
      " changed · " +
      difference.added +
      " added · " +
      difference.removed +
      " removed"
    : summary.hotelOccurrences.length +
      (summary.hotelOccurrences.length === 1 ? " occurrence" : " occurrences");
  return (
    <details className="group border-t">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2">
          <Hotel aria-hidden="true" className="size-4 text-muted-foreground" />
          Hotel occurrences
        </span>
        <span className="flex items-center gap-2 text-right text-[10px] text-muted-foreground">
          {differenceLabel}
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="space-y-2 pb-3 text-[11px]">
        <p className="text-muted-foreground">
          Explicit Hotel items only. An occurrence is not an inferred night.
        </p>
        {difference ? (
          <HotelDifferenceEntries summary={summary} />
        ) : (
          <PrimaryHotelOccurrences summary={summary} />
        )}
      </div>
    </details>
  );
}
