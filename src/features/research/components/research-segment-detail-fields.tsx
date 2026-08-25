"use client";

import { Localized, useI18n } from "@/features/i18n/i18n-provider";
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
  const { t } = useI18n();
  return (
    <div className="min-w-0 space-y-2">
      {label ? (
        <p className="truncate text-sm font-semibold text-muted-foreground">
          <Localized value={label} />
        </p>
      ) : null}
      {category === "flight" ? (
        <div className="grid min-w-0 grid-cols-2 gap-4">
          <Input
            aria-label={`${label ? `${t(label)} ` : ""}${t("Airline")}`}
            id={`${id}-airline`}
            maxLength={120}
            onChange={(event) => onChange({ carrier: event.target.value })}
            placeholder="Airline"
            data-i18n-placeholder={"Airline"}
            value={segment.carrier ?? ""}
          />
          <Input
            aria-label={`${label ? `${t(label)} ` : ""}${t("Flight number")}`}
            id={`${id}-service-number`}
            maxLength={80}
            onChange={(event) => onChange({ serviceNumber: event.target.value })}
            placeholder="Flight number"
            data-i18n-placeholder={"Flight number"}
            value={segment.serviceNumber ?? ""}
          />
        </div>
      ) : (
        <Input
          aria-label={`${label ? `${t(label)} ` : ""}${t("Train number")}`}
          id={`${id}-service-number`}
          maxLength={80}
          onChange={(event) => onChange({ serviceNumber: event.target.value })}
          placeholder="e.g. Nozomi 21"
          data-i18n-placeholder={"e.g. Nozomi 21"}
          value={segment.serviceNumber ?? ""}
        />
      )}
    </div>
  );
}
