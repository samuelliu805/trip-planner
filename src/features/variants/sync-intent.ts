import { z } from "zod";
import {
  createRouteVariantSchema,
  updateRouteVariantSchema,
  routeVariantIdentitySchema,
  deleteRouteVariantSchema,
} from "./schema";
import type { PlannerWorkspace, PlannerVariant } from "../itinerary/types";

const sourceSchema = z.custom<PlannerWorkspace>((value) => {
  const source = value as PlannerWorkspace;
  return (
    !!source?.variant?.id &&
    Array.isArray(source.days) &&
    source.days.every((day) => typeof day.id === "string" && Array.isArray(day.items)) &&
    Array.isArray(source.routePlans)
  );
});
export const variantIntentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    input: createRouteVariantSchema,
    duplicate: z.boolean(),
    source: sourceSchema,
  }),
  z.object({
    kind: z.literal("update"),
    input: updateRouteVariantSchema,
    before: z.string().optional(),
  }),
  z.object({
    kind: z.literal("primary"),
    input: routeVariantIdentitySchema,
    before: z.string().optional(),
  }),
  z.object({ kind: z.literal("delete"), input: deleteRouteVariantSchema }),
]);
export type VariantSyncIntent = z.infer<typeof variantIntentSchema>;
export { sourceSnapshot, variantFields } from "./source-snapshot.ts";
export function projectVariantList(confirmed: PlannerVariant[], intents: VariantSyncIntent[]) {
  return intents.reduce((variants, intent) => {
    if (intent.kind === "create")
      return [
        ...variants.filter((row) => row.id !== intent.input.operationId),
        {
          ...intent.source.variant,
          id: intent.input.operationId,
          name: intent.input.name,
          color: intent.input.color,
          is_primary: false,
          version: 1,
          days_version: 1,
          items_version: 1,
          content_version: 1,
        },
      ];
    if (intent.kind === "delete")
      return variants.filter((row) => row.id !== intent.input.variantId);
    return variants.map((row) =>
      intent.kind === "primary"
        ? {
            ...row,
            is_primary: row.id === intent.input.variantId,
            version: row.version + (row.is_primary !== (row.id === intent.input.variantId) ? 1 : 0),
          }
        : row.id === intent.input.variantId
          ? { ...row, name: intent.input.name, color: intent.input.color, version: row.version + 1 }
          : row,
    );
  }, confirmed);
}
export function pendingVariantWorkspace(
  intent: Extract<VariantSyncIntent, { kind: "create" }>,
): PlannerWorkspace {
  const variant = projectVariantList([], [intent])[0],
    dayIds = intent.input.dayIds!,
    itemIds = intent.input.itemIds!;
  return {
    variant,
    routePlans: intent.duplicate
      ? intent.source.routePlans.map((plan) => ({
          ...plan,
          variant_id: variant.id,
          day_id: dayIds[plan.day_id],
          calculation: null,
          stops: plan.stops.map((stop) => ({ ...stop, item_id: itemIds[stop.item_id] })),
        }))
      : [],
    days: intent.source.days.map((day) => ({
      ...day,
      id: dayIds[day.id],
      variant_id: variant.id,
      version: 1,
      items_version: 1,
      content_version: 1,
      date: intent.duplicate ? day.date : null,
      title: intent.duplicate ? day.title : null,
      notes: intent.duplicate ? day.notes : null,
      items: intent.duplicate
        ? day.items.map((item) => ({
            ...item,
            id: itemIds[item.id],
            day_id: dayIds[day.id],
            variant_id: variant.id,
            version: 1,
            details:
              item.details &&
              typeof item.details === "object" &&
              !Array.isArray(item.details) &&
              "flightEndpointParentId" in item.details
                ? {
                    ...item.details,
                    flightEndpointParentId:
                      itemIds[String(item.details.flightEndpointParentId)] ??
                      item.details.flightEndpointParentId,
                  }
                : item.details,
          }))
        : [],
    })),
  };
}
