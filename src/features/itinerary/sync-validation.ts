import { z } from "zod";
import {
  createItineraryItemSchema,
  updateItineraryItemSchema,
  deleteItineraryItemSchema,
  itineraryItemTypes,
} from "./item-schema";
import {
  clearItineraryItemsSchema,
  reorderItineraryItemsSchema,
  insertTripDaySchema,
  removeTripDaySchema,
  reorderVariantDaysSchema,
  copyItineraryItemsSchema,
} from "./day-schema";

const item = z
  .object({
    id: z.uuid(),
    type: z.enum(itineraryItemTypes),
    title: z.string(),
    day_id: z.uuid(),
    variant_id: z.uuid(),
    trip_id: z.uuid(),
    version: z.number().int().positive(),
    sort_order: z.number().finite(),
    details: z.record(z.string(), z.json()),
    links: z.array(z.object({ label: z.string(), url: z.string() }).passthrough()).optional(),
    start_time: z.string().nullable(),
    end_time: z.string().nullable(),
    price_amount: z.number().nullable(),
    price_currency: z.string().nullable(),
    attachments: z.array(z.json()).optional(),
    notes: z.string().nullable(),
    booking_url: z.string().nullable(),
    place_id: z.string().nullable(),
  })
  .passthrough();
const metadata = {
  beforeOrder: z.array(z.string()).optional(),
  beforeDays: z.array(z.string()).optional(),
  beforeItem: z.string().optional(),
  beforeDay: z.string().optional(),
  beforeItems: z.record(z.string(), z.string()).optional(),
  followsLocal: z.boolean().optional(),
};
const intent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), input: createItineraryItemSchema, ...metadata }),
  z.object({ kind: z.literal("update"), input: updateItineraryItemSchema, ...metadata }),
  z.object({ kind: z.literal("delete"), input: deleteItineraryItemSchema, ...metadata }),
  z.object({ kind: z.literal("clear"), input: clearItineraryItemsSchema, ...metadata }),
  z.object({ kind: z.literal("reorder"), input: reorderItineraryItemsSchema, ...metadata }),
  z.object({ kind: z.literal("insertDay"), input: insertTripDaySchema, ...metadata }),
  z.object({ kind: z.literal("removeDay"), input: removeTripDaySchema, ...metadata }),
  z.object({ kind: z.literal("reorderDays"), input: reorderVariantDaysSchema, ...metadata }),
  z.object({
    kind: z.literal("copy"),
    input: copyItineraryItemsSchema,
    sources: z.array(item),
    replacements: z.array(item),
    copiedItems: z.array(item),
    ...metadata,
  }),
]);
export function validatePlannerIntent(value: unknown) {
  intent.parse(value);
}
