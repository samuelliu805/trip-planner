import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { Calculator, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { RouteLegMode } from "@/features/routes/types";

import { publicDayCityLabel } from "../presentation";
import { publicDayRoutePlan } from "../public-map-model";
import type {
  PublicItinerary,
  PublicItineraryItem,
  PublicRouteCalculation,
  PublicSavedRoute,
} from "../types";
import { PublicRouteLegDetails } from "./public-route-summary";
import { PublicSharedRouteSummary } from "./public-shared-route-summary";
import { PublicTemporaryRouteStops } from "./public-temporary-route-stops";

export function PublicDayRoutePanel({
  allowExplore,
  calculation,
  canCalculate,
  candidates,
  legModes,
  days,
  error,
  exploring,
  localStops,
  onBackToShared,
  onCalculate,
  onEdit,
  onExplore,
  onModeChange,
  onReset,
  onSelectDay,
  onToggleStop,
  omittedActivityCount,
  pending,
  plan,
  primaryAction,
  route,
  routeSetupItems,
  showCalculateAction = true,
}: {
  allowExplore: boolean;
  canCalculate: boolean;
  showCalculateAction?: boolean;
  calculation?: PublicRouteCalculation;
  candidates: PublicItineraryItem[];
  legModes: RouteLegMode[];
  days: PublicItinerary["days"];
  error?: string;
  exploring: boolean;
  localStops: string[];
  onBackToShared: () => void;
  onCalculate: () => void;
  onEdit: () => void;
  onExplore: () => void;
  onModeChange: (index: number, mode: RouteLegMode) => void;
  onReset: () => void;
  onSelectDay: (dayRef: string) => void;
  onToggleStop: (ref: string, include: boolean) => void;
  omittedActivityCount: number;
  pending: boolean;
  plan: ReturnType<typeof publicDayRoutePlan>;
  primaryAction?: ReactNode;
  route?: PublicSavedRoute;
  routeSetupItems: PublicItineraryItem[];
}) {
  const { t } = useI18n();
  const day = plan.day;

  return (
    <div className="space-y-2">
      {days.length > 1 ? (
        <Select onValueChange={onSelectDay} value={day?.ref}>
          <SelectTrigger aria-label={t("Route day")} className="min-h-11 font-semibold">
            <span className="truncate">
              {day ? <T message={"Day {day}"} values={{ day: day.dayNumber }} /> : null}
              {day && publicDayCityLabel(day, true) ? ` · ${publicDayCityLabel(day, true)}` : ""}
            </span>
          </SelectTrigger>
          <SelectContent>
            {days.map((option) => (
              <SelectItem key={option.ref} value={option.ref}>
                <T message={"Day {day}"} values={{ day: option.dayNumber }} />
                {publicDayCityLabel(option, true) ? ` · ${publicDayCityLabel(option, true)}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {primaryAction}
      {exploring ? (
        calculation ? (
          <>
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <span>
                <T message={"Temporary route"} />
              </span>
              <span aria-hidden="true" className="text-border">
                ·
              </span>
              <span className="text-muted-foreground">
                <T message={"Only you"} />
              </span>
            </div>
            <PublicRouteLegDetails
              labels={localStops.map(
                (ref) => routeSetupItems.find((item) => item.ref === ref)?.title ?? t("Stop"),
              )}
              legs={calculation.legs}
            />
            {error ? (
              <p aria-live="polite" className="text-xs text-destructive">
                <Localized value={error} />
              </p>
            ) : null}
            <div
              className={`grid ${showCalculateAction ? "grid-cols-2" : "grid-cols-1"} gap-2 border-t pt-2`}
            >
              {showCalculateAction ? (
                <Button className="min-h-11" onClick={onEdit} type="button" variant="outline">
                  <T message={" Edit route "} />
                </Button>
              ) : null}
              <Button className="min-h-11" onClick={onBackToShared} type="button" variant="ghost">
                <T message={" Shared route "} />
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <span>
                <T message={"Temporary"} />
              </span>
              <span aria-hidden="true" className="text-border">
                ·
              </span>
              <span className="text-muted-foreground">
                <T message={"Only you"} />
              </span>
            </div>
            {!canCalculate ? (
              <p className="text-xs text-muted-foreground">
                <T message="Select two different mapped places to calculate a route." />
              </p>
            ) : null}
            <PublicTemporaryRouteStops
              candidates={candidates}
              items={routeSetupItems}
              legModes={legModes}
              localStops={localStops}
              onModeChange={onModeChange}
              pending={pending}
              onToggleStop={onToggleStop}
            />
            {error ? (
              <p aria-live="polite" className="text-xs text-destructive">
                <Localized value={error} />
              </p>
            ) : null}
            <div
              className={`grid ${showCalculateAction ? "grid-cols-[1fr_auto_auto]" : "grid-cols-2"} gap-2 border-t bg-background pt-2`}
            >
              {showCalculateAction ? (
                <Button
                  aria-busy={pending}
                  className="min-h-11"
                  disabled={pending || !canCalculate}
                  onClick={onCalculate}
                  type="button"
                >
                  {pending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Calculator className="size-4" />
                  )}
                  <Localized value={pending ? "Calculating…" : "Calculate"} />
                </Button>
              ) : null}
              <Button onClick={onReset} type="button" variant="outline">
                <T message={" Reset "} />
              </Button>
              <Button onClick={onBackToShared} type="button" variant="ghost">
                <T message={" Shared route "} />
              </Button>
            </div>
          </>
        )
      ) : (
        <PublicSharedRouteSummary
          canExplore={showCalculateAction && allowExplore && candidates.length >= 2}
          omittedActivityCount={omittedActivityCount}
          onExplore={onExplore}
          route={route}
          unmappedActivityCount={plan.unmappedActivities.length}
        />
      )}
    </div>
  );
}
