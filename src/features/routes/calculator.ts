import type { CalculatedRouteLeg, RouteLegRequest } from "../../lib/providers/routes/types.ts";

import { buildRouteConfigSignature, buildRouteLegSignature } from "./signatures.ts";
import type { DayRouteCalculation, RouteCalculationConfig } from "./types.ts";

export type RouteLegCalculator = (request: RouteLegRequest) => Promise<CalculatedRouteLeg>;

type CalculationResult = {
  cache: "full" | "partial" | "miss";
  configSignature: string;
  legs: CalculatedRouteLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number | null;
};

async function mapWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), tasks.length) }, () => worker()),
  );
  return results;
}

const totals = (legs: CalculatedRouteLeg[]) => ({
  totalDistanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
  totalDurationSeconds: legs.every((leg) => leg.durationSeconds !== null)
    ? legs.reduce((sum, leg) => sum + (leg.durationSeconds ?? 0), 0)
    : null,
});

export async function calculateRouteConfiguration(
  config: RouteCalculationConfig,
  previous: DayRouteCalculation | null,
  calculateLeg: RouteLegCalculator,
  concurrency = 3,
): Promise<CalculationResult> {
  const configSignature = buildRouteConfigSignature(config);
  if (previous?.config_signature === configSignature) {
    return {
      cache: "full",
      configSignature,
      legs: previous.calculatedLegs,
      ...totals(previous.calculatedLegs),
    };
  }

  const previousBySignature = new Map(
    (previous?.calculatedLegs ?? []).map((leg) => [leg.legSignature, leg]),
  );
  let reused = 0;
  const tasks = config.legModes.map((mode, index) => {
    const origin = config.stops[index];
    const destination = config.stops[index + 1];
    const legSignature = buildRouteLegSignature(config, index + 1, origin, destination, mode);
    const cached = previousBySignature.get(legSignature);
    if (cached) {
      reused += 1;
      return async () => cached;
    }
    return () =>
      calculateLeg({
        destination: destination.coordinates,
        legSignature,
        mode,
        origin: origin.coordinates,
        position: index + 1,
      });
  });
  const legs = await mapWithConcurrency(tasks, concurrency);
  return {
    cache: reused > 0 ? "partial" : "miss",
    configSignature,
    legs,
    ...totals(legs),
  };
}
