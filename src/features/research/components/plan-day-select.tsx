"use client";

import { CalendarDays } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/features/i18n/i18n-provider";

import type { ResearchPlanDay } from "../types";

export function PlanDaySelect({
  days,
  onChange,
  value,
}: {
  days: ResearchPlanDay[];
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useI18n();
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger aria-label={t("Plan day")} className="mt-1 bg-card font-medium">
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder={t("Choose a day")} />
        </span>
      </SelectTrigger>
      <SelectContent>
        {days.map((day) => (
          <SelectItem key={day.id} value={day.id}>
            {t("Day {number}", { number: day.dayNumber })}
            {day.date ? ` · ${day.date}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PlanAnchorDaySelect({
  days,
  onChange,
  value,
}: {
  days: ResearchPlanDay[];
  onChange: (dayNumber: number) => void;
  value: number | null;
}) {
  const { t } = useI18n();
  return (
    <Select
      onValueChange={(next) => onChange(Number(next))}
      value={value ? String(value) : undefined}
    >
      <SelectTrigger aria-label={t("Plan day")} className="mt-1 min-h-11 bg-card font-medium">
        <SelectValue placeholder={t("Choose a Day")} />
      </SelectTrigger>
      <SelectContent>
        {days.map((day) => (
          <SelectItem key={day.id} value={String(day.dayNumber)}>
            {t("Day {number}", { number: day.dayNumber })}
            {day.date ? ` · ${day.date}` : ` · ${t("No dates")}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
