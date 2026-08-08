"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { VariantComparisonSheetStatus } from "@/features/variants/components/variant-comparison-feedback";
import { VariantComparisonRows } from "@/features/variants/components/variant-comparison-rows";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";

export function RouteVariantComparisonSheet({
  comparison,
  onOpenChange,
  open,
}: {
  comparison: VariantComparisonUi;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const active = comparison.presentations.find(({ isActive }) => isActive);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="comparison-sheet max-h-[82dvh]" side="bottom">
        <SheetHeader className="py-4">
          <SheetTitle>
            {comparison.dayNumber ? `Day ${comparison.dayNumber} routes` : "Routes on map"}
          </SheetTitle>
          <SheetDescription>
            {comparison.dayNumber
              ? "Solid lines are saved routes; dashed lines preview Activity stop order."
              : "Dashed lines show locality order—not driving directions."}{" "}
            The Matrix stays on {active?.name ?? "the route being edited"}.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 overflow-y-auto p-4">
          {comparison.isLoading || comparison.error ? (
            <VariantComparisonSheetStatus comparison={comparison} />
          ) : (
            <VariantComparisonRows comparison={comparison} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
