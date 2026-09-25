"use client";

import { T } from "@/features/i18n/i18n-provider";

import { emptyIdeaVariantPlacement, type IdeaVariantPlacement } from "../idea-variant-placement";
import type { ResearchItem, ResearchPlanSnapshot } from "../types";
import { IdeaJourneyPreviewList } from "./idea-journey-preview-list";
import { IdeaVariantTarget } from "./idea-variant-target";

export type IdeaApplyResult = { error?: string; status?: "applied" | "already_applied" };

export function IdeaVariantTargetList({
  item,
  loading,
  onPlacementChange,
  onSelectedChange,
  placements,
  plans,
  results,
  selectedIds,
  variantName,
}: {
  item: ResearchItem;
  loading: boolean;
  onPlacementChange: (variantId: string, placement: IdeaVariantPlacement) => void;
  onSelectedChange: (variantId: string, selected: boolean) => void;
  placements: Record<string, IdeaVariantPlacement>;
  plans: ResearchPlanSnapshot[];
  results: Record<string, IdeaApplyResult>;
  selectedIds: string[];
  variantName: string;
}) {
  return (
    <>
      <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium">
        <T message="Adding to Plan: {variant}" values={{ variant: variantName }} />
      </p>
      <IdeaJourneyPreviewList items={[item]} />
      <p className="text-sm text-muted-foreground">
        <T message="Choose one or more Plans. Each Plan has its own day and date preview." />
      </p>
      {loading ? (
        <p role="status">
          <T message="Loading Plans…" />
        </p>
      ) : null}
      {!loading &&
        plans.map((plan) => (
          <IdeaVariantTarget
            item={item}
            key={plan.variantId}
            onPlacementChange={(placement) => onPlacementChange(plan.variantId, placement)}
            onSelectedChange={(selected) => onSelectedChange(plan.variantId, selected)}
            placement={placements[plan.variantId] ?? emptyIdeaVariantPlacement()}
            plan={plan}
            result={results[plan.variantId]}
            selected={selectedIds.includes(plan.variantId)}
          />
        ))}
    </>
  );
}
