"use client";

import { useId } from "react";

import { PlannerEditorTextField } from "@/features/itinerary/components/planner-editor-fields";
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
        <PlannerEditorTextField
          description="Use the airline operating this segment. It can differ for the return flight."
          id={`${id}-airline`}
          label="Airline"
          maxLength={120}
          onChange={(event) => onChange({ carrier: event.target.value })}
          placeholder="e.g. ANA"
          value={segment.carrier ?? ""}
        />
      ) : null}
      <PlannerEditorTextField
        id={`${id}-service-number`}
        label={category === "flight" ? "Flight number" : "Train number"}
        maxLength={80}
        onChange={(event) => onChange({ serviceNumber: event.target.value })}
        placeholder={category === "flight" ? "e.g. NH 107" : "e.g. Nozomi 21"}
        value={segment.serviceNumber ?? ""}
      />
    </fieldset>
  );
}
