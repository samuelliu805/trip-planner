import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import {
  Bike,
  BusFront,
  Calculator,
  Car,
  LoaderCircle,
  Plane,
  Route,
  TrainFront,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { overviewRouteModes, type OverviewRouteMode } from "@/features/routes/types";
import { publicOverviewStops } from "../public-map-model";
import type { PublicRouteCalculation } from "../types";
import { PublicRouteLegDetails } from "./public-route-summary";

const overviewModeLabels: Record<OverviewRouteMode, string> = {
  bike: "Bike",
  bus: "Bus",
  flight: "Flight",
  self_driving: "Drive",
  train: "Train",
};

const overviewModeIcons = {
  bike: Bike,
  bus: BusFront,
  flight: Plane,
  self_driving: Car,
  train: TrainFront,
} satisfies Record<OverviewRouteMode, typeof Route>;

type OverviewStop = ReturnType<typeof publicOverviewStops>[number];

export function PublicOverviewRoutePanel({
  allowExplore,
  calculation,
  error,
  modes,
  onCalculate,
  onModeChange,
  onReset,
  pending,
  stops,
}: {
  allowExplore: boolean;
  calculation?: PublicRouteCalculation;
  error?: string;
  modes: OverviewRouteMode[];
  onCalculate: () => void;
  onModeChange: (index: number, mode: OverviewRouteMode) => void;
  onReset: () => void;
  pending: boolean;
  stops: OverviewStop[];
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      {calculation ? (
        <PublicRouteLegDetails labels={stops.map(({ title }) => title)} legs={calculation.legs} />
      ) : stops.length > 1 ? (
        <ol
          aria-label="Whole-trip stage connections"
          data-i18n-aria-label={"Whole-trip stage connections"}
          className="divide-y border"
        >
          {stops.slice(0, -1).map((stop, index) => {
            const next = stops[index + 1];
            const mode = modes[index] ?? "self_driving";
            const ModeIcon = overviewModeIcons[mode];
            return (
              <li
                className="grid min-h-12 grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 px-2"
                key={`${stop.ref}:${next.ref}`}
              >
                <span className="min-w-0 truncate text-xs font-medium">
                  {stop.title} → {next.title}
                </span>
                {allowExplore ? (
                  <Select
                    disabled={pending}
                    onValueChange={(value) => onModeChange(index, value as OverviewRouteMode)}
                    value={mode}
                  >
                    <SelectTrigger
                      aria-label={t("Travel from {from} to {to}", {
                        from: stop.title,
                        to: next.title,
                      })}
                      className="h-9"
                    >
                      <span className="flex items-center gap-1.5 truncate text-xs">
                        <ModeIcon aria-hidden="true" className="size-3.5 shrink-0" />
                        <Localized value={overviewModeLabels[mode]} />
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {overviewRouteModes.map((option) => (
                        <SelectItem key={option} value={option}>
                          <Localized value={overviewModeLabels[option]} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-right text-xs text-muted-foreground">
                    <T message={"Preview"} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="py-2 text-xs text-muted-foreground">
          <T message={" Add usable Activity places in at least two stages to show a route. "} />
        </p>
      )}
      {error ? (
        <p aria-live="polite" className="text-xs text-destructive">
          <Localized value={error} />
        </p>
      ) : null}
      {allowExplore ? (
        <div className="flex gap-2">
          {calculation ? (
            <Button className="min-h-11 flex-1" onClick={onReset} type="button" variant="outline">
              <T message={" Edit route "} />
            </Button>
          ) : (
            <Button
              aria-busy={pending}
              className="min-h-11 flex-1"
              disabled={pending || stops.length < 2 || stops.length > 20}
              onClick={onCalculate}
              type="button"
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Calculator className="size-4" />
              )}
              <Localized value={pending ? "Calculating…" : "Calculate whole trip"} />
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          <T message={"Route calculation is disabled by the owner."} />
        </p>
      )}
    </div>
  );
}
