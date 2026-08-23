"use client";

import { useRef } from "react";

import { Input } from "@/components/ui/input";

import { ResearchField } from "./form-controls";
import { addIsoDateDays } from "../date-range";

function openDatePicker(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus();
  try {
    input.showPicker?.();
  } catch {
    // Safari can focus the return field even when programmatic showPicker is unavailable.
  }
}

export function DateRangeFields({
  endLabel,
  endName,
  endValue,
  onEndChange,
  onStartChange,
  minimumNights = 0,
  startLabel,
  startName,
  startValue,
}: {
  endLabel: string;
  endName?: string;
  endValue: string;
  onEndChange: (value: string) => void;
  onStartChange: (value: string) => void;
  minimumNights?: number;
  startLabel: string;
  startName?: string;
  startValue: string;
}) {
  const endRef = useRef<HTMLInputElement>(null);
  const minimumEnd = addIsoDateDays(startValue, minimumNights) ?? startValue;

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <ResearchField label={startLabel}>
        <Input
          className="planner-native-datetime-input block min-w-0 max-w-full"
          name={startName}
          onChange={(event) => {
            const value = event.target.value;
            onStartChange(value);
            const nextMinimum = addIsoDateDays(value, minimumNights) ?? value;
            if (minimumNights > 0 && nextMinimum && (!endValue || endValue < nextMinimum))
              onEndChange(nextMinimum);
            if (value) openDatePicker(endRef.current);
          }}
          type="date"
          value={startValue}
        />
      </ResearchField>
      <ResearchField label={endLabel}>
        <Input
          className="planner-native-datetime-input block min-w-0 max-w-full"
          min={minimumEnd || undefined}
          name={endName}
          onChange={(event) => onEndChange(event.target.value)}
          ref={endRef}
          type="date"
          value={endValue}
        />
      </ResearchField>
    </div>
  );
}
