"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { ResearchField } from "./form-controls";
import { ResearchOptionalSegmentFields } from "./research-optional-segment-fields";
import type { ResearchSegment } from "../types";

const blankSegment = (): ResearchSegment => ({
  arrivalDate: "",
  arrivalTime: "",
  departureDate: "",
  departureTime: "",
  destination: "",
  origin: "",
  serviceNumber: "",
});

export function ResearchMultiCityFields({
  onSegmentsChange,
  segments,
}: {
  onSegmentsChange: (segments: ResearchSegment[]) => void;
  segments: ResearchSegment[];
}) {
  const update = (index: number, values: Partial<ResearchSegment>) =>
    onSegmentsChange(
      segments.map((segment, position) =>
        position === index ? { ...segment, ...values } : segment,
      ),
    );
  return (
    <div className="space-y-3">
      {segments.map((segment, index) => (
        <fieldset className="min-w-0 space-y-3 rounded-xl border p-3" key={index}>
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            Flight {index + 1}
          </legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <ResearchField label="From">
              <Input
                onChange={(event) => update(index, { origin: event.target.value })}
                value={segment.origin}
              />
            </ResearchField>
            <ResearchField label="To">
              <Input
                onChange={(event) => update(index, { destination: event.target.value })}
                value={segment.destination}
              />
            </ResearchField>
          </div>
          <ResearchField label="Departure">
            <Input
              onChange={(event) => update(index, { departureDate: event.target.value })}
              type="date"
              value={segment.departureDate}
            />
          </ResearchField>
          <ResearchOptionalSegmentFields
            category="flight"
            onChange={(values) => update(index, values)}
            segment={segment}
          />
          {segments.length > 2 ? (
            <div className="flex justify-end">
              <Button
                aria-label={`Remove flight ${index + 1}`}
                className="size-11 p-0"
                onClick={() =>
                  onSegmentsChange(segments.filter((_, position) => position !== index))
                }
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ) : null}
        </fieldset>
      ))}
      <Button
        className="min-h-11 w-full"
        onClick={() => onSegmentsChange([...segments, blankSegment()])}
        type="button"
        variant="outline"
      >
        <Plus className="size-4" /> Add another flight
      </Button>
    </div>
  );
}
