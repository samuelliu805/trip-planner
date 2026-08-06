import { Bike, Calculator, Car, Footprints, Route, TrainFront } from "lucide-react";

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
import { RouteTotals } from "./public-route-summary";
import { PublicSharedRouteSummary } from "./public-shared-route-summary";
import { PublicTemporaryRouteStops } from "./public-temporary-route-stops";

const dayRouteModes = [
  { Icon: Car, label: "Drive", value: "self_driving" },
  { Icon: TrainFront, label: "Transit", value: "subway" },
  { Icon: Bike, label: "Bike", value: "bike" },
  { Icon: Footprints, label: "Walk", value: "walk" },
] satisfies Array<{ Icon: typeof Route; label: string; value: RouteLegMode }>;

export function PublicDayRoutePanel({
  allowExplore,
  calculation,
  candidates,
  dayMode,
  days,
  error,
  exploring,
  localStops,
  onBackToShared,
  onCalculate,
  onExplore,
  onModeChange,
  onMoveStop,
  onReset,
  onSelectDay,
  onToggleStop,
  omittedActivityCount,
  pending,
  plan,
  route,
  routeSetupItems,
}: {
  allowExplore: boolean;
  calculation?: PublicRouteCalculation;
  candidates: PublicItineraryItem[];
  dayMode: RouteLegMode;
  days: PublicItinerary["days"];
  error?: string;
  exploring: boolean;
  localStops: string[];
  onBackToShared: () => void;
  onCalculate: () => void;
  onExplore: () => void;
  onModeChange: (mode: RouteLegMode) => void;
  onMoveStop: (index: number, direction: -1 | 1) => void;
  onReset: () => void;
  onSelectDay: (dayRef: string) => void;
  onToggleStop: (ref: string, include: boolean) => void;
  omittedActivityCount: number;
  pending: boolean;
  plan: ReturnType<typeof publicDayRoutePlan>;
  route?: PublicSavedRoute;
  routeSetupItems: PublicItineraryItem[];
}) {
  const day = plan.day;

  return (
    <div className="space-y-2">
      {days.length > 1 ? (
        <Select onValueChange={onSelectDay} value={day?.ref}>
          <SelectTrigger aria-label="Route day" className="min-h-10 font-semibold">
            <span className="truncate">
              Day {day?.dayNumber}
              {day && publicDayCityLabel(day, true) ? ` · ${publicDayCityLabel(day, true)}` : ""}
            </span>
          </SelectTrigger>
          <SelectContent>
            {days.map((option) => (
              <SelectItem key={option.ref} value={option.ref}>
                Day {option.dayNumber}
                {publicDayCityLabel(option, true) ? ` · ${publicDayCityLabel(option, true)}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {exploring ? (
        <>
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <span>Temporary</span>
            <span aria-hidden="true" className="text-border">
              ·
            </span>
            <span className="text-muted-foreground">Only you</span>
          </div>
          <div
            aria-label="Temporary route travel mode"
            className="grid grid-cols-4 border"
            role="radiogroup"
          >
            {dayRouteModes.map(({ Icon, label, value }) => (
              <button
                aria-checked={dayMode === value}
                aria-label={label}
                className="flex min-h-12 flex-col items-center justify-center gap-0.5 border-r text-muted-foreground last:border-r-0 hover:bg-muted aria-checked:bg-primary aria-checked:text-primary-foreground"
                key={value}
                onClick={() => onModeChange(value)}
                role="radio"
                type="button"
              >
                <Icon aria-hidden="true" className="size-4" />
                <span className="text-[9px] font-semibold">{label}</span>
              </button>
            ))}
          </div>
          <PublicTemporaryRouteStops
            candidates={candidates}
            items={routeSetupItems}
            localStops={localStops}
            onMoveStop={onMoveStop}
            onToggleStop={onToggleStop}
            plan={plan}
          />
          {calculation ? <RouteTotals calculation={calculation} /> : null}
          {error ? (
            <p aria-live="polite" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="sticky bottom-0 grid grid-cols-[1fr_auto_auto] gap-2 border-t bg-background pt-2">
            <Button
              className="min-h-11"
              disabled={pending || localStops.length < 2}
              onClick={onCalculate}
              type="button"
            >
              <Calculator className="size-4" />
              {pending ? "Calculating…" : "Calculate"}
            </Button>
            <Button onClick={onReset} type="button" variant="outline">
              Reset
            </Button>
            <Button onClick={onBackToShared} type="button" variant="ghost">
              Shared route
            </Button>
          </div>
        </>
      ) : (
        <PublicSharedRouteSummary
          canExplore={allowExplore && candidates.length >= 2}
          candidates={candidates}
          omittedActivityCount={omittedActivityCount}
          onExplore={onExplore}
          route={route}
          unmappedActivityCount={plan.unmappedActivities.length}
        />
      )}
    </div>
  );
}
