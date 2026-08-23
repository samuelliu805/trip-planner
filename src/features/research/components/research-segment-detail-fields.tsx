"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import type { ResearchSegment } from "../types";

export function ResearchSegmentDetailFields({
  category,
  label,
  onChange,
  segment,
}: {
  category: "flight" | "train";
  label?: string;
  onChange: (values: Partial<ResearchSegment>) => void;
  segment: ResearchSegment;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      {label ? (
        <p className="truncate text-sm font-semibold text-muted-foreground">{label}</p>
      ) : null}
      {category === "flight" ? (
        <div className="grid min-w-0 grid-cols-2 gap-4">
          <Input
            aria-label={`${label ? `${label} ` : ""}Airline`}
            id={`${id}-airline`}
            maxLength={120}
            onChange={(event) => onChange({ carrier: event.target.value })}
            placeholder="Airline"
            value={segment.carrier ?? ""}
          />
          <Input
            aria-label={`${label ? `${label} ` : ""}Flight number`}
            id={`${id}-service-number`}
            maxLength={80}
            onChange={(event) => onChange({ serviceNumber: event.target.value })}
            placeholder="Flight number"
            value={segment.serviceNumber ?? ""}
          />
        </div>
      ) : (
        <Input
          aria-label={`${label ? `${label} ` : ""}Train number`}
          id={`${id}-service-number`}
          maxLength={80}
          onChange={(event) => onChange({ serviceNumber: event.target.value })}
          placeholder="e.g. Nozomi 21"
          value={segment.serviceNumber ?? ""}
        />
      )}
    </div>
  );
}
