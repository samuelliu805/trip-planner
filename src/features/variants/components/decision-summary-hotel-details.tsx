"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ChevronDown, Hotel } from "lucide-react";

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

function HotelOccurrences({ summary }: { summary: VariantDecisionSummary }) {
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
  return (
    <details className="group border-t">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2">
          <Hotel aria-hidden="true" className="size-4 text-muted-foreground" />
          <T message={" Hotel occurrences "} />
        </span>
        <span className="flex items-center gap-2 text-right text-[10px] text-muted-foreground">
          {t("{count} occurrence(s)", { count: summary.hotelOccurrences.length })}
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="space-y-2 pb-3 text-[11px]">
        <HotelOccurrences summary={summary} />
      </div>
    </details>
  );
}
