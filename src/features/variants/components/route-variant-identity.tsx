import type { PlannerVariant } from "@/features/itinerary/types";
import { cn } from "@/lib/utils";

function PrimaryBadge() {
  return (
    <span className="rounded-full border bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
      Primary
    </span>
  );
}

export function VariantIdentity({
  compact,
  variant,
}: {
  compact?: boolean;
  variant: PlannerVariant;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full border border-black/10"
        style={{ backgroundColor: variant.color }}
      />
      <span className={cn("truncate", compact && "max-w-24 sm:max-w-32")}>{variant.name}</span>
      {variant.is_primary ? <PrimaryBadge /> : null}
    </span>
  );
}
