import { z } from "zod";
import { itineraryItemTypes } from "./item-schema.ts";

const itemTelemetryFields = {
  itemKinds: z.array(z.enum(itineraryItemTypes)).max(itineraryItemTypes.length).optional(),
  operationId: z.uuid().optional(),
  surface: z.literal("planner").optional(),
};

export const clearItineraryItemsSchema = z
  .object({
    ...itemTelemetryFields,
    itemIds: z.array(z.uuid()).min(1).max(2000),
    tripId: z.uuid(),
    variantId: z.uuid(),
  })
  .refine(
    (value) => new Set(value.itemIds).size === value.itemIds.length,
    "Selected items must be unique.",
  );

export const insertTripDaySchema = z.object({
  beforeDayNumber: z.number().int().min(1).max(366),
  tripId: z.uuid(),
  variantId: z.uuid(),
});

export const removeTripDaySchema = z.object({
  dayId: z.uuid(),
  tripId: z.uuid(),
  variantId: z.uuid(),
});

export const reorderVariantDaysSchema = z
  .object({
    orderedDayIds: z.array(z.uuid()).min(1).max(366),
    tripId: z.uuid(),
    variantId: z.uuid(),
  })
  .refine(
    (value) => new Set(value.orderedDayIds).size === value.orderedDayIds.length,
    "Days must be unique.",
  );

export const reorderItineraryItemsSchema = z
  .object({
    ...itemTelemetryFields,
    dayId: z.uuid(),
    items: z.array(z.object({ id: z.uuid(), sortOrder: z.number().int().min(0) })).min(1),
    tripId: z.uuid(),
    variantId: z.uuid(),
  })
  .refine(
    (value) => new Set(value.items.map(({ id }) => id)).size === value.items.length,
    "Items must be unique.",
  );

export const copyItineraryItemsSchema = z
  .object({
    ...itemTelemetryFields,
    preservePlace: z.boolean().optional().default(true),
    sourceItemIds: z.array(z.uuid()).min(1),
    targetDayId: z.uuid(),
    tripId: z.uuid(),
    variantId: z.uuid(),
  })
  .refine(
    (value) => new Set(value.sourceItemIds).size === value.sourceItemIds.length,
    "Items must be unique.",
  );

export type ClearItineraryItemsInput = z.input<typeof clearItineraryItemsSchema>;
export type InsertTripDayInput = z.input<typeof insertTripDaySchema>;
export type RemoveTripDayInput = z.input<typeof removeTripDaySchema>;
export type ReorderVariantDaysInput = z.input<typeof reorderVariantDaysSchema>;
export type ReorderItineraryItemsInput = z.input<typeof reorderItineraryItemsSchema>;
export type CopyItineraryItemsInput = z.input<typeof copyItineraryItemsSchema>;
