"use client";

import { Localized, useI18n } from "@/features/i18n/i18n-provider";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ResearchSegment } from "../types";
import { flightArrivalLooksLate } from "../flight-date-validity";

export function ResearchDateTimeField({
  date,
  dateName,
  label,
  minDate,
  onDateChange,
  onTimeChange,
  time,
  timeName,
}: {
  date: string;
  dateName?: string;
  label: string;
  minDate?: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  time: string;
  timeName?: string;
}) {
  const id = useId();
  const { t } = useI18n();
  return (
    <div className="planner-native-control-frame min-w-0 max-w-full space-y-2">
      <Label className="text-sm font-medium" htmlFor={`${id}-date`}>
        <Localized value={label} />
      </Label>
      <div className="grid min-w-0 max-w-full grid-cols-2 gap-2" data-research-schedule-control="">
        <Input
          aria-label={t("{label} date", { label: t(label) })}
          className="planner-native-datetime-input h-[3.75rem] min-w-0 rounded-xl px-2 text-base"
          id={`${id}-date`}
          min={minDate || undefined}
          name={dateName}
          onChange={(event) => onDateChange(event.target.value)}
          type="date"
          value={date}
        />
        <Input
          aria-label={t("{label} time (optional)", { label: t(label) })}
          className="planner-native-time-input h-[3.75rem] min-w-0 rounded-xl px-2 text-base"
          name={timeName}
          onChange={(event) => onTimeChange(event.target.value)}
          type="time"
          value={time}
        />
      </div>
    </div>
  );
}

export function ResearchSegmentScheduleFields({
  category,
  onSegmentsChange,
  segments,
}: {
  category: "flight" | "train";
  onSegmentsChange: (segments: ResearchSegment[]) => void;
  segments: ResearchSegment[];
}) {
  const { locale, t } = useI18n();
  function update(index: number, values: Partial<ResearchSegment>) {
    onSegmentsChange(
      segments.map((segment, position) =>
        position === index ? { ...segment, ...values } : segment,
      ),
    );
  }

  return (
    <section
      className="min-w-0 space-y-5"
      aria-label="Departure and arrival"
      data-i18n-aria-label={"Departure and arrival"}
    >
      {segments.map((segment, index) => {
        const route =
          segment.origin || segment.destination
            ? `${segment.origin || t("From")} → ${segment.destination || t("To")}`
            : locale === "zh-CN"
              ? `第${index + 1}段${t(category === "flight" ? "Flight" : "Train")}`
              : `${t(category === "flight" ? "Flight" : "Train")} ${index + 1}`;
        return (
          <div
            className="min-w-0 space-y-3"
            key={`${index}-${segment.origin}-${segment.destination}`}
          >
            {segments.length > 1 ? (
              <p className="max-w-full truncate text-base font-semibold leading-6">{route}</p>
            ) : null}
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <ResearchDateTimeField
                date={segment.departureDate}
                label="Departure"
                onDateChange={(departureDate) => update(index, { departureDate })}
                onTimeChange={(departureTime) => update(index, { departureTime })}
                time={segment.departureTime ?? ""}
              />
              <ResearchDateTimeField
                date={segment.arrivalDate ?? ""}
                label="Arrival"
                minDate={segment.departureDate}
                onDateChange={(arrivalDate) => update(index, { arrivalDate })}
                onTimeChange={(arrivalTime) => update(index, { arrivalTime })}
                time={segment.arrivalTime ?? ""}
              />
            </div>
            {category === "flight" &&
            flightArrivalLooksLate(segment.departureDate, segment.arrivalDate) ? (
              <p className="text-sm text-destructive" role="alert">
                <Localized value="Flight arrival is more than two days after departure. Check the year." />
              </p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
