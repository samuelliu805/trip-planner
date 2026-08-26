export type PlannerMapMode = "overview" | "day_route" | "comparison";
export type PlannerComparisonScope = Exclude<PlannerMapMode, "comparison">;
export type PlannerMapModeChange = (
  mode: PlannerMapMode,
  comparisonScope?: PlannerComparisonScope,
) => void;
