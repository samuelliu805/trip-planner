"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Hotel } from "lucide-react";

import { DecisionSummaryDisclosureSummary } from "@/features/variants/components/decision-summary-card-elements";
import type { VariantDecisionSummary } from "@/features/variants/decision-summary-types";
import {
  consecutiveHotelStays,
  type HotelStay,
} from "@/features/variants/decision-summary-hotel-stays";

function stayDateLabel(
  stay: HotelStay,
  locale: "en" | "zh-CN",
  t: (message: string, values?: Record<string, number | string>) => string,
) {
  if (!stay.start.date || !stay.end.date) {
    return stay.start.dayNumber === stay.end.dayNumber
      ? t("Day {number}", { number: stay.start.dayNumber })
      : t("Day {start}–{end}", { end: stay.end.dayNumber, start: stay.start.dayNumber });
  }
  const start = parseISO(stay.start.date);
  const end = parseISO(stay.end.date);
  if (stay.start.date === stay.end.date)
    return format(start, locale === "zh-CN" ? "yyyy年M月d日" : "MMM d, yyyy", {
      locale: locale === "zh-CN" ? zhCN : undefined,
    });
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return locale === "zh-CN"
      ? `${format(start, "yyyy年M月d日", { locale: zhCN })}–${format(end, "d日", { locale: zhCN })}`
      : `${format(start, "MMM d")}–${format(end, "d, yyyy")}`;
  }
  const pattern = locale === "zh-CN" ? "yyyy年M月d日" : "MMM d, yyyy";
  const dateLocale = locale === "zh-CN" ? zhCN : undefined;
  return `${format(start, pattern, { locale: dateLocale })}–${format(end, pattern, { locale: dateLocale })}`;
}

function HotelStays({ stays }: { stays: HotelStay[] }) {
  const { locale, t } = useI18n();
  return stays.length ? (
    <ul className="space-y-1">
      {stays.map((stay) => (
        <li className="rounded-md bg-muted/50 p-2" key={`${stay.start.itemId}:${stay.end.itemId}`}>
          {stay.title} · {stayDateLabel(stay, locale, t)}
        </li>
      ))}
    </ul>
  ) : (
    <p>
      <T message={"No Hotels."} />
    </p>
  );
}

export function DecisionSummaryHotelDetails({ summary }: { summary: VariantDecisionSummary }) {
  const { t } = useI18n();
  const stays = consecutiveHotelStays(summary.hotelOccurrences);
  return (
    <details className="group border-t">
      <DecisionSummaryDisclosureSummary
        icon={Hotel}
        label={<T message={"Hotels"} />}
        trailing={t("{count} hotel(s)", { count: stays.length })}
      />
      <div className="space-y-2 pb-3 text-[11px]">
        <HotelStays stays={stays} />
      </div>
    </details>
  );
}
