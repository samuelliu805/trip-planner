"use client";

import { Input } from "@/components/ui/input";

import { ResearchField } from "./form-controls";
import type { ResearchSegment } from "../types";

export function ResearchOptionalSegmentFields({
  label,
  onChange,
  segment,
}: {
  label?: string;
  onChange: (values: Partial<ResearchSegment>) => void;
  segment: ResearchSegment;
}) {
  return (
    <div className="min-w-0 space-y-3 rounded-lg border bg-background p-3">
      {label ? <p className="text-xs font-semibold text-muted-foreground">{label}</p> : null}
      <div className="grid min-w-0 gap-3 min-[430px]:grid-cols-2">
        <ResearchField label="Departure time">
          <Input
            onChange={(event) => onChange({ departureTime: event.target.value })}
            type="time"
            value={segment.departureTime ?? ""}
          />
        </ResearchField>
        <ResearchField label="Arrival time">
          <Input
            onChange={(event) => onChange({ arrivalTime: event.target.value })}
            type="time"
            value={segment.arrivalTime ?? ""}
          />
        </ResearchField>
      </div>
      <ResearchField label="Arrival date">
        <Input
          min={segment.departureDate || undefined}
          onChange={(event) => onChange({ arrivalDate: event.target.value })}
          type="date"
          value={segment.arrivalDate ?? ""}
        />
      </ResearchField>
    </div>
  );
}
