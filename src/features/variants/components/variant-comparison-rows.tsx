"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";
import { formatMoney } from "@/features/research/money";

function VariantBadges({ isActive, isPrimary }: { isActive: boolean; isPrimary: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
      {isPrimary ? (
        <span className="rounded-sm bg-emerald-100 px-1.5 py-0.5 text-emerald-800">Primary</span>
      ) : null}
      <span
        className={`rounded-sm px-1.5 py-0.5 ${isActive ? "border text-foreground" : "bg-muted text-muted-foreground"}`}
      >
        {isActive ? "Editing" : "Read only"}
      </span>
    </span>
  );
}

export function VariantComparisonRows({ comparison }: { comparison: VariantComparisonUi }) {
  return comparison.presentations.map((variant) => {
    const visible = variant.isActive || comparison.visibleVariantIds.has(variant.variantId);
    const controlId = `comparison-route-${variant.variantId}`;
    return (
      <article
        className={`flex min-h-16 gap-2.5 rounded-lg border px-3 py-2 ${variant.isActive ? "border-primary/50 bg-primary/5" : "bg-background"}`}
        key={variant.variantId}
      >
        <Checkbox
          aria-describedby={`${controlId}-status`}
          aria-label={
            variant.isActive
              ? `${variant.name} is being edited and is always visible on the comparison map`
              : `${visible ? "Hide" : "Show"} ${variant.name} on comparison map`
          }
          checked={visible}
          className="mt-0.5"
          disabled={variant.isActive}
          id={controlId}
          onCheckedChange={() => comparison.toggleVariant(variant.variantId)}
        />
        <span
          aria-hidden="true"
          className="mt-1 size-2.5 shrink-0 rounded-full ring-2 ring-background"
          style={{ backgroundColor: variant.color }}
        />
        <label className={`min-w-0 flex-1 ${visible ? "" : "opacity-55"}`} htmlFor={controlId}>
          <span className="flex items-start justify-between gap-2">
            <span className="truncate text-xs font-semibold">{variant.name}</span>
            <VariantBadges isActive={variant.isActive} isPrimary={variant.isPrimary} />
          </span>
          <span
            aria-label={`${comparison.dayNumber ? `Day ${comparison.dayNumber} route` : "City/town"} sequence: ${variant.citySequence}`}
            className="mt-1 block truncate text-[11px] text-muted-foreground"
            title={variant.citySequence}
          >
            {variant.citySequence}
          </span>
          <span className="mt-0.5 block truncate text-[10px] font-semibold text-foreground">
            Known Cost ·{" "}
            {variant.knownCost.length
              ? variant.knownCost
                  .map(({ amount, currency }) => `${currency} ${formatMoney(amount, currency)}`)
                  .join(" · ")
              : "No priced items"}
          </span>
          <span
            className="mt-0.5 block text-[10px] font-medium text-muted-foreground"
            id={`${controlId}-status`}
          >
            {variant.isActive ? "Always visible" : visible ? "Visible" : "Hidden"}
          </span>
        </label>
      </article>
    );
  });
}
