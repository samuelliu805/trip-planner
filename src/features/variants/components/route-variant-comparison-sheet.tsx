"use client";

import { PullUpPanel } from "@/components/ui/pull-up-panel";
import { useI18n } from "@/features/i18n/i18n-provider";
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
  const { t } = useI18n();
  const active = comparison.presentations.find(({ isActive }) => isActive);
  return (
    <PullUpPanel
      className="comparison-sheet z-[120] max-h-[62dvh]"
      description={t("{explanation} The Matrix stays on {route}.", {
        explanation: t(
          comparison.dayNumber
            ? "Solid lines are saved routes; dashed lines preview Activity stop order."
            : "Dashed lines show city/town order—not driving directions.",
        ),
        route: active?.name ?? t("the route being edited"),
      })}
      dragMode="mobile"
      id="route-comparison"
      onOpenChange={onOpenChange}
      open={open}
      overlayClassName="z-[115]"
      title={
        comparison.dayNumber
          ? t("Day {day} routes", { day: comparison.dayNumber })
          : t("Routes on map")
      }
    >
      <div className="space-y-2 overflow-y-auto overscroll-contain p-4">
        {comparison.isLoading || comparison.error ? (
          <VariantComparisonSheetStatus comparison={comparison} />
        ) : (
          <VariantComparisonRows comparison={comparison} />
        )}
      </div>
    </PullUpPanel>
  );
}
