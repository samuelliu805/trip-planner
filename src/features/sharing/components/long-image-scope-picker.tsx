"use client";

import { addDays, format, parseISO } from "date-fns";
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

function dayLabel(dayNumber: number, startDate: string | null) {
  if (!startDate) return `Day ${dayNumber}`;
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
  const customRange = value.mode === "date_range";
  const startDay = customRange ? value.startDayNumber : 1;
  const endDay = customRange ? value.endDayNumber : dayCount;
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">Days in the image</legend>
      <div className="grid grid-cols-2 overflow-hidden border">
        <button
          aria-pressed={!customRange}
          className="min-h-11 border-r px-3 text-sm font-medium aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          onClick={() => onChange({ mode: "entire_trip" })}
          type="button"
        >
          Entire trip
        </button>
        <button
          aria-pressed={customRange}
          className="min-h-11 px-3 text-sm font-medium aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          onClick={() =>
            onChange({ endDayNumber: dayCount, mode: "date_range", startDayNumber: 1 })
          }
          type="button"
        >
          Date range
        </button>
      </div>
      {customRange ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-start`}>From</Label>
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
                    {dayLabel(day, startDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-end`}>Through</Label>
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
                    {dayLabel(day, startDate)}
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
