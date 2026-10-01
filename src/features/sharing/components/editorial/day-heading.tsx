"use client";

import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useI18n } from "@/features/i18n/i18n-provider";
import { publicDayCityLabel } from "../../presentation";
import { meaningfulText } from "../../editorial-presentation";
import type { PublicItineraryDay } from "../../types";

export function DayHeading({ day }: { day: PublicItineraryDay }) {
  const { locale, t } = useI18n();
  const city = meaningfulText(publicDayCityLabel(day));
  const title = meaningfulText(day.title);
  return (
    <header className="edition-day-heading">
      <span className="edition-day-number">{String(day.dayNumber).padStart(2, "0")}</span>
      <div>
        <span className="edition-kicker">{t("Day {day}", { day: day.dayNumber })}</span>
        {title || city ? <h3>{title ?? city}</h3> : null}
        {day.date || (title && city) ? (
          <p>
            {title && city ? (
              <span>
                {city}
                {day.date ? " · " : ""}
              </span>
            ) : null}
            {day.date ? (
              <time dateTime={day.date}>
                {format(
                  parseISO(day.date),
                  locale === "zh-CN" ? "yyyy年M月d日 EEEE" : "EEEE, MMM d, yyyy",
                  {
                    locale: locale === "zh-CN" ? zhCN : undefined,
                  },
                )}
              </time>
            ) : null}
          </p>
        ) : null}
      </div>
    </header>
  );
}
