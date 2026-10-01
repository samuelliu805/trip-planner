"use client";

import { ArrowRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useI18n } from "@/features/i18n/i18n-provider";
import { publicDayCityLabel } from "../../presentation";
import { meaningfulText } from "../../editorial-presentation";
import type { PublicItineraryDay } from "../../types";

export function editionDayTitle(day: PublicItineraryDay, fallback: string) {
  return meaningfulText(day.title) ?? meaningfulText(publicDayCityLabel(day)) ?? fallback;
}

export function EditionDate({ day }: { day: PublicItineraryDay }) {
  const { locale } = useI18n();
  return day.date ? (
    <time dateTime={day.date}>
      {format(parseISO(day.date), locale === "zh-CN" ? "M月d日" : "MMM d", {
        locale: locale === "zh-CN" ? zhCN : undefined,
      })}
    </time>
  ) : null;
}

export function EditionNavigation({
  days,
  onSelectDay,
  selectedDayRef,
  variant = "contents",
}: {
  days: PublicItineraryDay[];
  onSelectDay: (ref: string) => void;
  selectedDayRef?: string;
  variant?: "contents" | "rail" | "dates";
}) {
  const { t } = useI18n();
  if (!days.length) return null;
  return (
    <nav className={`edition-navigation edition-${variant}`} aria-label={t("Chapters")}>
      <span className="edition-kicker">{t(variant === "dates" ? "Shared days" : "Chapters")}</span>
      <ol>
        {days.map((day) => (
          <li key={day.ref}>
            <button
              type="button"
              onClick={() => onSelectDay(day.ref)}
              aria-current={(selectedDayRef ?? days[0].ref) === day.ref ? "date" : undefined}
            >
              <span className="edition-navigation-number">
                {variant === "dates"
                  ? t("Day {day}", { day: day.dayNumber })
                  : String(day.dayNumber).padStart(2, "0")}
              </span>
              <span className="edition-navigation-copy">
                {variant !== "dates" ? (
                  <strong>{editionDayTitle(day, t("Day {day}", { day: day.dayNumber }))}</strong>
                ) : null}
                <EditionDate day={day} />
              </span>
              {variant === "contents" ? <ArrowRight aria-hidden="true" /> : null}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
