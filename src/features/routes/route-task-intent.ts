import { z } from "zod";
import { saveRouteSchema, clearRouteSchema, calculateOverviewRouteSchema } from "./action-schemas";
import type { DayRoutePlan } from "./types";

export const routeTaskSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("day"),
    input: saveRouteSchema,
    calculateOperationId: z.uuid(),
    expectedInputSnapshot: z.string().max(20000),
    before: z.string().optional(),
  }),
  z.object({ kind: z.literal("clear"), input: clearRouteSchema, before: z.string().optional() }),
  z.object({
    kind: z.literal("overview"),
    input: calculateOverviewRouteSchema,
    stageKey: z.string(),
    generation: z.number().int().nonnegative(),
    modes: z.array(z.string().nullable()),
  }),
]);
export type RouteTaskIntent = z.infer<typeof routeTaskSchema>;
export const routePlanSnapshot = (plan: DayRoutePlan) =>
  JSON.stringify([plan.stops.map((stop) => stop.item_id), plan.legs.map((leg) => leg.mode)]);
