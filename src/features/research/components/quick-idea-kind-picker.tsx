"use client";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/features/i18n/i18n-provider";

import type { IdeaKind } from "../idea-input";

const kinds = ["flight", "stay", "car", "activity"] as const;
export const ideaKindLabels: Record<Exclude<IdeaKind, "unknown">, string> = {
  activity: "Activity",
  car: "Car",
  flight: "Flight",
  stay: "Stay",
};
export const ideaKindSaveLabels: Record<Exclude<IdeaKind, "unknown">, string> = {
  activity: "Save Activity",
  car: "Save Car",
  flight: "Save Flight",
  stay: "Save Stay",
};

export function QuickIdeaKindPicker({
  current,
  onChoose,
}: {
  current: IdeaKind;
  onChoose: (kind: Exclude<IdeaKind, "unknown">) => void;
}) {
  const { t } = useI18n();
  return (
    <div aria-label={t("Choose idea type")} className="flex flex-wrap gap-2">
      {kinds.map((kind) => (
        <Button
          aria-pressed={current === kind}
          className="min-h-11"
          key={kind}
          onClick={() => onChoose(kind)}
          type="button"
          variant={current === kind ? "default" : "outline"}
        >
          {current === kind ? <Check aria-hidden="true" className="size-4" /> : null}
          {t(ideaKindLabels[kind])}
        </Button>
      ))}
    </div>
  );
}
