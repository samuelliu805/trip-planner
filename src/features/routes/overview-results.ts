import type { CalculatedRouteLeg } from "../../lib/providers/routes/types.ts";

export type OverviewTaskResult = {
  operationId: string;
  stageKey: string;
  generation: number;
  modes: Array<string | null>;
  legs: CalculatedRouteLeg[];
};
/** Only matching snapshots are displayed; results never rewrite the configuration. */
export function matchingOverviewResults(
  results: OverviewTaskResult[],
  stageKey: string,
  generation: number,
  modes: Array<string | undefined>,
) {
  const legs = new Map<number, CalculatedRouteLeg>();
  for (const result of results) {
    if (result.stageKey !== stageKey || result.generation !== generation) continue;
    for (const leg of result.legs)
      if (!legs.has(leg.position) && result.modes[leg.position - 1] === modes[leg.position - 1])
        legs.set(leg.position, leg);
  }
  return [...legs.values()].sort((a, b) => a.position - b.position);
}
