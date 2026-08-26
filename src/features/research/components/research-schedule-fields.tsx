"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ResearchSegment } from "../types";

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
      <Label htmlFor={`${id}-date`}>
        <Localized value={label} />{" "}
        <span className="font-normal text-muted-foreground">
          <T message={"time optional"} />
        </span>
      </Label>
      <div className="planner-editor-compound-field grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_minmax(7.75rem,0.58fr)] overflow-hidden rounded-xl border border-input bg-background shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
        <Input
          aria-label={t("{label} date", { label: t(label) })}
          className="planner-native-datetime-input"
          id={`${id}-date`}
          min={minDate || undefined}
          name={dateName}
          onChange={(event) => onDateChange(event.target.value)}
          type="date"
          value={date}
        />
        <Input
          aria-label={t("{label} time (optional)", { label: t(label) })}
          className="planner-native-time-input border-l"
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
      className="min-w-0 space-y-6"
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
              <p className="max-w-full truncate text-sm font-semibold">{route}</p>
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
          </div>
        );
      })}
    </section>
  );
}
