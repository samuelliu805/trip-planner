"use client";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/features/i18n/i18n-provider";
import type { IdeaComparison } from "../idea-actions";
export function IdeaComparisonList({
  comparisons,
  onView,
  onDelete,
}: {
  comparisons: IdeaComparison[];
  onView: (comparison: IdeaComparison) => void;
  onDelete: (comparison: IdeaComparison) => void;
}) {
  const { t } = useI18n();
  if (!comparisons.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {comparisons.map((comparison) => (
        <div className="flex min-w-0 items-center border-b p-1 last:border-b-0" key={comparison.id}>
          <Button
            className="min-h-11 min-w-0 flex-1 justify-start text-left"
            onClick={() => onView(comparison)}
            type="button"
            variant="ghost"
          >
            <span className="min-w-0 truncate">{comparison.title}</span>
          </Button>
          <Button
            aria-label={t("Delete comparison {title}", { title: comparison.title })}
            className="size-11 shrink-0 p-0"
            onClick={() => onDelete(comparison)}
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
