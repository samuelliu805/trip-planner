"use client";

import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import type { PlannerDay } from "@/features/itinerary/types";

import { DayActions } from "./planner-grid-elements";

export function PlannerDayHeaderCell({
  day,
  isOnlyDay,
  onInsert,
  onSelect,
  pending,
  selected,
}: {
  day: PlannerDay;
  isOnlyDay: boolean;
  onInsert: (position: number) => void;
  onSelect: () => void;
  pending: boolean;
  selected: boolean;
}) {
  const { locale, t } = useI18n();
  return (
    <div
      aria-selected={selected}
      className={`sticky left-0 z-20 flex w-28 shrink-0 cursor-pointer flex-col border-r px-2 py-1 font-mono text-[13px] leading-[1.35] min-[1200px]:text-[11px] ${selected ? "matrix-frozen-selected shadow-[inset_0_0_0_2px_var(--primary)]" : "bg-background"}`}
      data-day-header=""
      data-day-number={day.day_number}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="rowheader"
      tabIndex={0}
    >
      <div className="matrix-frozen-content flex h-full flex-col">
        <span className="block font-sans text-[15px] font-semibold leading-[1.25] min-[1200px]:text-[13px] sm:hidden">
          <T message={"Day {day}"} values={{ day: day.day_number }} />
        </span>
        <span className="block text-[15px] font-medium leading-[1.25] min-[1200px]:text-[13px]">
          {day.date
            ? format(parseISO(day.date), locale === "zh-CN" ? "M月d日" : "MMM d", {
                locale: locale === "zh-CN" ? zhCN : undefined,
              })
            : t("Date TBD")}
        </span>
        {day.date ? (
          <span className="block font-sans text-[13px] leading-[1.35] text-muted-foreground min-[1200px]:text-[11px]">
            {format(parseISO(day.date), "EEE", {
              locale: locale === "zh-CN" ? zhCN : undefined,
            })}
          </span>
        ) : (
          <span className="hidden font-sans text-[13px] leading-[1.35] text-muted-foreground min-[1200px]:text-[11px] sm:block">
            <T message={" Add dates later "} />
          </span>
        )}
        <DayActions
          day={day}
          onInsert={onInsert}
          pending={pending}
          visible={isOnlyDay || selected}
        />
      </div>
    </div>
  );
}
