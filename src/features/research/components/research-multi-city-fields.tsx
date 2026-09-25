"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { ResearchField } from "./form-controls";
import { ResearchDateTimeField } from "./research-schedule-fields";
import type { ResearchSegment } from "../types";

const blankSegment = (): ResearchSegment => ({
  arrivalDate: "",
  arrivalTime: "",
  carrier: "",
  departureDate: "",
  departureTime: "",
  destination: "",
  origin: "",
  serviceNumber: "",
});

export function ResearchMultiCityFields({
  journeyType,
  onSegmentsChange,
  segments,
}: {
  journeyType: "one_way" | "round_trip" | "multi_city";
  onSegmentsChange: (segments: ResearchSegment[]) => void;
  segments: ResearchSegment[];
}) {
  const { t } = useI18n();
  const update = (index: number, values: Partial<ResearchSegment>) =>
    onSegmentsChange(
      segments.map((segment, position) =>
        position === index ? { ...segment, ...values } : segment,
      ),
    );
  return (
    <div className="space-y-6">
      {segments.map((segment, index) => (
        <fieldset className="min-w-0 space-y-3" key={index}>
          <legend className="text-base font-semibold leading-6">
            <T message={" Flight "} />
            {index + 1}
          </legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <ResearchField label="From">
              <Input
                className="h-[3.75rem] rounded-xl text-base"
                onChange={(event) => update(index, { origin: event.target.value })}
                value={segment.origin}
              />
            </ResearchField>
            <ResearchField label="To">
              <Input
                className="h-[3.75rem] rounded-xl text-base"
                onChange={(event) => update(index, { destination: event.target.value })}
                value={segment.destination}
              />
            </ResearchField>
          </div>
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
          {segments.length > 2 ? (
            <div className="flex justify-end">
              <Button
                aria-label={t("Remove flight {number}", { number: index + 1 })}
                className="size-[3.75rem] p-0"
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
        className="min-h-[3.75rem] w-full"
        onClick={() =>
          onSegmentsChange([
            ...segments.map((segment, index) => ({
              ...segment,
              journeyIndex:
                segment.journeyIndex ??
                (journeyType === "multi_city"
                  ? index
                  : journeyType === "round_trip" && index >= Math.ceil(segments.length / 2)
                    ? 1
                    : 0),
            })),
            {
              ...blankSegment(),
              journeyIndex:
                journeyType === "multi_city"
                  ? segments.length
                  : journeyType === "round_trip"
                    ? 1
                    : 0,
            },
          ])
        }
        type="button"
        variant="outline"
      >
        <Plus className="size-4" /> <T message={" Add another flight "} />
      </Button>
    </div>
  );
}
