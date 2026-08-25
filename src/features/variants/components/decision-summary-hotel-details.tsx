"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ChevronDown, Hotel } from "lucide-react";

import { DeltaChip } from "@/features/variants/components/decision-summary-card-elements";
import type { VariantDecisionSummary } from "@/features/variants/decision-summary-types";

function alignmentLabel(
  label: string,
  locale: "en" | "zh-CN",
  t: (message: string, values?: Record<string, number | string>) => string,
) {
  if (label.startsWith("Day ")) return t("Day {number}", { number: label.slice(4) });
  return format(parseISO(label), locale === "zh-CN" ? "yyyy年M月d日" : "MMM d, yyyy", {
    locale: locale === "zh-CN" ? zhCN : undefined,
  });
}

function HotelDifferenceEntries({ summary }: { summary: VariantDecisionSummary }) {
  const { locale, t } = useI18n();
  const difference = summary.hotelDifference;
  if (!difference) return null;
  return (
    <>
      <div className="flex flex-wrap gap-1">
        <span className="rounded-full border px-2 py-0.5">
          {difference.same} <T message={" same"} />
        </span>
        <span className="rounded-full border px-2 py-0.5">
          {difference.changed} <T message={" changed"} />
        </span>
        <span className="rounded-full border px-2 py-0.5">
          {difference.added} <T message={" added"} />
        </span>
        <span className="rounded-full border px-2 py-0.5">
          {difference.removed} <T message={" removed"} />
        </span>
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
              <span className="font-medium capitalize">
                <Localized value={entry.status} />
              </span>
              {" · "}
              {alignmentLabel(entry.alignmentLabel, locale, t)}
              <span className="block text-muted-foreground">
                {entry.status === "changed"
                  ? (entry.primary?.title ?? t("Hotel")) +
                    " → " +
                    (entry.compared?.title ?? t("Hotel"))
                  : (entry.compared?.title ?? entry.primary?.title ?? t("Hotel"))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          <T message={"No Hotel occurrences in either route."} />
        </p>
      )}
    </>
  );
}

function PrimaryHotelOccurrences({ summary }: { summary: VariantDecisionSummary }) {
  const { locale, t } = useI18n();
  return summary.hotelOccurrences.length ? (
    <ul className="space-y-1">
      {summary.hotelOccurrences.map((hotel) => (
        <li className="rounded-md bg-muted/50 p-2" key={hotel.itemId}>
          {hotel.title} ·{" "}
          {hotel.date
            ? alignmentLabel(hotel.date, locale, t)
            : t("Day {number}", { number: hotel.dayNumber })}
        </li>
      ))}
    </ul>
  ) : (
    <p>
      <T message={"No explicit Hotel occurrences."} />
    </p>
  );
}

export function DecisionSummaryHotelDetails({ summary }: { summary: VariantDecisionSummary }) {
  const { t } = useI18n();
  const difference = summary.hotelDifference;
  const differenceLabel = difference
    ? t("{changed} changed · {added} added · {removed} removed", {
        added: difference.added,
        changed: difference.changed,
        removed: difference.removed,
      })
    : t("{count} occurrence(s)", { count: summary.hotelOccurrences.length });
  return (
    <details className="group border-t">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2">
          <Hotel aria-hidden="true" className="size-4 text-muted-foreground" />
          <T message={" Hotel occurrences "} />
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
          <T message={" Explicit Hotel items only. An occurrence is not an inferred night. "} />
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
