import { z } from "zod";

export const itineraryItemTypes = [
  "hotel",
  "activity",
  "meal",
  "transport",
  "location",
  "car_rental",
  "flight",
  "train",
  "note",
] as const;

const optionalTime = z.union([z.literal(""), z.iso.time({ precision: -1 })]).optional().nullable();
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().nullable();
const optionalUrl = z.union([z.literal(""), z.url().refine((url) => /^https?:\/\//i.test(url), "Use an HTTP(S) URL.")]).optional().nullable();

export const carRentalDetailsSchema = z.object({
  action: z.enum(["pickup", "return"]),
  confirmed: z.boolean(),
  location: z.string().trim().min(1, "Enter the pickup or return location.").max(200),
  provider: optionalText(120),
  time: optionalTime,
}).strict();

const genericDetailsSchema = z.record(z.string(), z.json());

const itemBaseSchema = z.object({
  bookingUrl: optionalUrl,
  dayId: z.uuid(),
  endTime: optionalTime,
  notes: optionalText(5000),
  placeId: z.uuid().optional().nullable(),
  startTime: optionalTime,
  title: z.string().trim().min(1, "Enter an item title.").max(200),
  tripId: z.uuid(),
  variantId: z.uuid(),
});

export const createItineraryItemSchema = z.discriminatedUnion("type", [
  itemBaseSchema.extend({ type: z.literal("car_rental"), details: carRentalDetailsSchema }),
  ...itineraryItemTypes
    .filter((type) => type !== "car_rental")
    .map((type) => itemBaseSchema.extend({ type: z.literal(type), details: genericDetailsSchema.optional().default({}) })),
]).refine((value) => !value.endTime || !value.startTime || value.endTime >= value.startTime, {
  message: "End time must be on or after start time.",
  path: ["endTime"],
});

export const updateItineraryItemSchema = z.object({
  ...itemBaseSchema.partial().shape,
  details: z.record(z.string(), z.json()).optional(),
  id: z.uuid(),
  tripId: z.uuid(),
  type: z.enum(itineraryItemTypes),
}).refine((value) => !value.endTime || !value.startTime || value.endTime >= value.startTime, {
  message: "End time must be on or after start time.",
  path: ["endTime"],
}).superRefine((value, context) => {
  if (value.type === "car_rental") {
    const parsed = carRentalDetailsSchema.safeParse(value.details);
    if (!parsed.success) parsed.error.issues.forEach((issue) => context.addIssue({ ...issue, path: ["details", ...issue.path] }));
  }
});

export const deleteItineraryItemSchema = z.object({ id: z.uuid(), tripId: z.uuid() });

export const reorderItineraryItemsSchema = z.object({
  dayId: z.uuid(),
  items: z.array(z.object({ id: z.uuid(), sortOrder: z.number().int().min(0) })).min(1),
  tripId: z.uuid(),
}).refine((value) => new Set(value.items.map(({ id }) => id)).size === value.items.length, "Items must be unique.");

export const copyItineraryItemsSchema = z.object({
  preservePlace: z.boolean().optional().default(true),
  sourceItemIds: z.array(z.uuid()).min(1),
  targetDayId: z.uuid(),
  tripId: z.uuid(),
}).refine((value) => new Set(value.sourceItemIds).size === value.sourceItemIds.length, "Items must be unique.");

export type CreateItineraryItemInput = z.input<typeof createItineraryItemSchema>;
export type UpdateItineraryItemInput = z.input<typeof updateItineraryItemSchema>;
export type DeleteItineraryItemInput = z.input<typeof deleteItineraryItemSchema>;
export type ReorderItineraryItemsInput = z.input<typeof reorderItineraryItemsSchema>;
export type CopyItineraryItemsInput = z.input<typeof copyItineraryItemsSchema>;
