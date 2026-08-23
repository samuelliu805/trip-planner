"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import {
  PlannerEditorField,
  PlannerEditorTextField,
} from "@/features/itinerary/components/planner-editor-fields";
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
    <fieldset className="min-w-0 space-y-3 rounded-xl border p-3">
      {label ? <legend className="px-1 text-sm font-semibold">{label}</legend> : null}
      {category === "flight" ? (
        <PlannerEditorField
          description="The operating airline may be different for each segment."
          id={`${id}-airline`}
          label="Airline & flight number"
        >
          <div className="planner-editor-compound-field grid min-w-0 max-w-full grid-cols-2 overflow-hidden rounded-xl border border-input bg-background shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
            <Input
              aria-label="Airline"
              id={`${id}-airline`}
              maxLength={120}
              onChange={(event) => onChange({ carrier: event.target.value })}
              placeholder="Airline"
              value={segment.carrier ?? ""}
            />
            <Input
              aria-label="Flight number"
              maxLength={80}
              onChange={(event) => onChange({ serviceNumber: event.target.value })}
              placeholder="Flight number"
              value={segment.serviceNumber ?? ""}
            />
          </div>
        </PlannerEditorField>
      ) : (
        <PlannerEditorTextField
          id={`${id}-service-number`}
          label="Train number"
          maxLength={80}
          onChange={(event) => onChange({ serviceNumber: event.target.value })}
          placeholder="e.g. Nozomi 21"
          value={segment.serviceNumber ?? ""}
        />
      )}
    </fieldset>
  );
}
