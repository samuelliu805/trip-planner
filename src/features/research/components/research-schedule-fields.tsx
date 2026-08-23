"use client";

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
  return (
    <div className="planner-native-control-frame min-w-0 max-w-full space-y-2">
      <Label htmlFor={`${id}-date`}>
        {label} <span className="font-normal text-muted-foreground">time optional</span>
      </Label>
      <div className="planner-editor-compound-field grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_minmax(7.75rem,0.58fr)] overflow-hidden rounded-xl border border-input bg-background shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
        <Input
          aria-label={`${label} date`}
          className="planner-native-datetime-input"
          id={`${id}-date`}
          min={minDate || undefined}
          name={dateName}
          onChange={(event) => onDateChange(event.target.value)}
          type="date"
          value={date}
        />
        <Input
          aria-label={`${label} time (optional)`}
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
  function update(index: number, values: Partial<ResearchSegment>) {
    onSegmentsChange(
      segments.map((segment, position) =>
        position === index ? { ...segment, ...values } : segment,
      ),
    );
  }

  return (
    <section className="min-w-0 space-y-4" aria-label="Departure and arrival">
      {segments.map((segment, index) => {
        const route =
          segment.origin || segment.destination
            ? `${segment.origin || "From"} → ${segment.destination || "To"}`
            : `${category === "flight" ? "Flight" : "Train"} ${index + 1}`;
        return (
          <fieldset
            className="min-w-0 space-y-4 rounded-xl border p-4"
            key={`${index}-${segment.origin}-${segment.destination}`}
          >
            {segments.length > 1 ? (
              <legend className="max-w-full truncate px-1 text-sm font-semibold">{route}</legend>
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
          </fieldset>
        );
      })}
    </section>
  );
}
