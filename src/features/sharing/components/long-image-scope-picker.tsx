"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { addDays, format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { LongImageScope } from "../types";

function dayLabel(dayNumber: number, startDate: string | null, locale: "en" | "zh-CN") {
  if (!startDate) return locale === "zh-CN" ? `第${dayNumber}天` : `Day ${dayNumber}`;
  if (locale === "zh-CN")
    return `第${dayNumber}天 · ${format(addDays(parseISO(startDate), dayNumber - 1), "M月d日", { locale: zhCN })}`;
  return `Day ${dayNumber} · ${format(addDays(parseISO(startDate), dayNumber - 1), "MMM d")}`;
}

export function LongImageScopePicker({
  dayCount,
  onChange,
  startDate,
  value,
}: {
  dayCount: number;
  onChange: (scope: LongImageScope) => void;
  startDate: string | null;
  value: LongImageScope;
}) {
  const id = useId();
  const { locale } = useI18n();
  const customRange = value.mode === "date_range";
  const startDay = customRange ? value.startDayNumber : 1;
  const endDay = customRange ? value.endDayNumber : dayCount;
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">
        <T message={"Days in the image"} />
      </legend>
      <div className="grid grid-cols-2 overflow-hidden border">
        <button
          aria-pressed={!customRange}
          className="min-h-11 border-r px-3 text-sm font-medium aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          onClick={() => onChange({ mode: "entire_trip" })}
          type="button"
        >
          <T message={" Entire trip "} />
        </button>
        <button
          aria-pressed={customRange}
          className="min-h-11 px-3 text-sm font-medium aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          onClick={() =>
            onChange({ endDayNumber: dayCount, mode: "date_range", startDayNumber: 1 })
          }
          type="button"
        >
          <T message={" Date range "} />
        </button>
      </div>
      {customRange ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-start`}>
              <T message={"From"} />
            </Label>
            <Select
              onValueChange={(nextValue) => {
                const nextStart = Number(nextValue);
                onChange({
                  endDayNumber: Math.max(nextStart, endDay),
                  mode: "date_range",
                  startDayNumber: nextStart,
                });
              }}
              value={String(startDay)}
            >
              <SelectTrigger className="min-h-11 min-w-0" id={`${id}-start`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {days.map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {dayLabel(day, startDate, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-end`}>
              <T message={"Through"} />
            </Label>
            <Select
              onValueChange={(nextValue) =>
                onChange({
                  endDayNumber: Number(nextValue),
                  mode: "date_range",
                  startDayNumber: startDay,
                })
              }
              value={String(endDay)}
            >
              <SelectTrigger className="min-h-11 min-w-0" id={`${id}-end`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {days.slice(startDay - 1).map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {dayLabel(day, startDate, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
