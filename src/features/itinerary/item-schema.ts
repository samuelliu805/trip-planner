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

const optionalTime = z
  .union([z.literal(""), z.iso.time({ precision: -1 })])
  .optional()
  .nullable();
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().nullable();
const optionalUrl = z
  .union([z.literal(""), z.url().refine((url) => /^https?:\/\//i.test(url), "Use an HTTP(S) URL.")])
  .optional()
  .nullable();
const itemLinkSchema = z.object({
  label: z.string().trim().min(1, "Add a link label.").max(80),
  url: z.url().refine((url) => /^https?:\/\//i.test(url), "Use an HTTP(S) URL."),
});

export const placeSnapshotSchema = z
  .object({
    administrativeAreaName: z.string().trim().min(1).max(300).optional(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    displayName: z.string().trim().min(1).max(300),
    formattedAddress: z.string().trim().max(500).optional(),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    localityKind: z
      .enum([
        "locality",
        "postal_town",
        "administrative_area_level_3",
        "administrative_area_level_2",
        "sublocality_level_1",
        "sublocality",
      ])
      .optional(),
    localityName: z.string().trim().min(1).max(300).optional(),
    localitySource: z.literal("google_address_component").optional(),
    provider: z.literal("google"),
    providerPlaceId: z.string().trim().min(1).max(300),
  })
  .superRefine((value, context) => {
    if (Boolean(value.localityName) !== Boolean(value.localityKind))
      context.addIssue({
        code: "custom",
        message: "Place locality name and kind must be provided together.",
        path: ["localityName"],
      });
  });

export const carRentalDetailsSchema = z
  .object({
    action: z.enum(["pickup", "return"]),
    address: optionalText(300),
    provider: optionalText(120),
    researchSourceId: z.uuid().optional(),
  })
  .strict();

const addressDetailsSchema = z.object({ address: optionalText(300) }).strict();
const mealDetailsSchema = z.object({ location: optionalText(300) }).strict();
const transportDetailsSchema = z
  .object({
    arrivalDate: optionalText(10),
    arrivalTime: optionalTime,
    departureDate: optionalText(10),
    destination: optionalText(200),
    destinationPlace: placeSnapshotSchema.optional().nullable(),
    mode: z.enum([
      "flight",
      "train",
      "self_driving",
      "bus",
      "ferry",
      "taxi",
      "rideshare",
      "bike",
      "walk",
      "subway",
      "tram",
      "shuttle",
      "cable_car",
      "motorcycle",
      "other",
    ]),
    origin: optionalText(200),
    originPlace: placeSnapshotSchema.optional().nullable(),
    researchSourceId: z.uuid().optional(),
    segmentIndex: z.number().int().min(0).max(11).optional(),
    serviceNumber: optionalText(80),
  })
  .strict();
const activityDetailsSchema = z.object({ location: optionalText(300) }).strict();
const genericDetailsSchema = z.record(z.string(), z.json());

const itemBaseSchema = z.object({
  bookingUrl: optionalUrl,
  links: z.array(itemLinkSchema).max(20, "Add no more than 20 links.").optional(),
  dayId: z.uuid(),
  endTime: optionalTime,
  notes: optionalText(5000),
  placeId: z.uuid().optional().nullable(),
  placeSnapshot: placeSnapshotSchema.optional().nullable(),
  priceAmount: z.number().min(0).max(9_999_999_999.99).optional().nullable(),
  priceCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional()
    .nullable(),
  startTime: optionalTime,
  title: z.string().trim().min(1, "Enter an item title.").max(200),
  tripId: z.uuid(),
  variantId: z.uuid(),
});

const createItemBaseSchema = itemBaseSchema.extend({
  insertAfterItemId: z.uuid().nullable().optional(),
});

function validateCommonItem(
  value: Partial<z.infer<typeof itemBaseSchema>> & {
    type: (typeof itineraryItemTypes)[number];
  },
  context: z.RefinementCtx,
) {
  if (value.priceAmount !== null && value.priceAmount !== undefined && !value.priceCurrency)
    context.addIssue({
      code: "custom",
      message: "Choose a currency.",
      path: ["priceCurrency"],
    });
  if (
    ["location", "note"].includes(value.type) &&
    value.priceAmount !== null &&
    value.priceAmount !== undefined
  )
    context.addIssue({
      code: "custom",
      message: "This item type does not contribute a Plan price.",
      path: ["priceAmount"],
    });
  if (value.type === "location" && !value.placeId && !value.placeSnapshot)
    context.addIssue({
      code: "custom",
      message: "Choose a city from Google Maps.",
      path: ["placeSnapshot"],
    });
  if (["hotel", "note"].includes(value.type) && (value.startTime || value.endTime))
    context.addIssue({
      code: "custom",
      message: "This item type does not support times.",
      path: ["startTime"],
    });
  if (["car_rental", "meal"].includes(value.type) && value.endTime)
    context.addIssue({
      code: "custom",
      message: "This item type supports one time only.",
      path: ["endTime"],
    });
  if (["location", "note"].includes(value.type) && (value.bookingUrl || value.links?.length))
    context.addIssue({
      code: "custom",
      message: "This item type does not support links.",
      path: ["links"],
    });
}

export const createItineraryItemSchema = z
  .discriminatedUnion("type", [
    createItemBaseSchema.extend({ type: z.literal("car_rental"), details: carRentalDetailsSchema }),
    createItemBaseSchema.extend({ type: z.literal("hotel"), details: addressDetailsSchema }),
    createItemBaseSchema.extend({ type: z.literal("meal"), details: mealDetailsSchema }),
    createItemBaseSchema.extend({ type: z.literal("transport"), details: transportDetailsSchema }),
    createItemBaseSchema.extend({ type: z.literal("activity"), details: activityDetailsSchema }),
    ...itineraryItemTypes
      .filter((type) => !["car_rental", "hotel", "meal", "transport", "activity"].includes(type))
      .map((type) =>
        createItemBaseSchema.extend({
          type: z.literal(type),
          details: genericDetailsSchema.optional().default({}),
        }),
      ),
  ])
  .refine((value) => !value.endTime || !value.startTime || value.endTime >= value.startTime, {
    message: "End time must be on or after start time.",
    path: ["endTime"],
  })
  .superRefine((value, context) => {
    validateCommonItem(value, context);
    if (
      value.type === "car_rental" &&
      value.details.action === "return" &&
      value.priceAmount !== null &&
      value.priceAmount !== undefined
    )
      context.addIssue({
        code: "custom",
        message: "Store the rental total on the pick-up item.",
        path: ["priceAmount"],
      });
  });

export const updateItineraryItemSchema = z
  .object({
    ...itemBaseSchema.partial().shape,
    details: z.record(z.string(), z.json()).optional(),
    id: z.uuid(),
    insertAfterItemId: z.uuid().nullable().optional(),
    tripId: z.uuid(),
    type: z.enum(itineraryItemTypes),
    variantId: z.uuid(),
  })
  .refine((value) => !value.endTime || !value.startTime || value.endTime >= value.startTime, {
    message: "End time must be on or after start time.",
    path: ["endTime"],
  })
  .superRefine((value, context) => {
    validateCommonItem(value, context);
    if (value.type !== "car_rental") return;
    const parsed = carRentalDetailsSchema.safeParse(value.details);
    if (!parsed.success)
      parsed.error.issues.forEach((issue) =>
        context.addIssue({ ...issue, path: ["details", ...issue.path] }),
      );
    if (
      parsed.success &&
      parsed.data.action === "return" &&
      value.priceAmount !== null &&
      value.priceAmount !== undefined
    )
      context.addIssue({
        code: "custom",
        message: "Store the rental total on the pick-up item.",
        path: ["priceAmount"],
      });
  });

export const deleteItineraryItemSchema = z.object({
  id: z.uuid(),
  tripId: z.uuid(),
  variantId: z.uuid(),
});

export type CreateItineraryItemInput = z.input<typeof createItineraryItemSchema>;
export type UpdateItineraryItemInput = z.input<typeof updateItineraryItemSchema>;
export type DeleteItineraryItemInput = z.input<typeof deleteItineraryItemSchema>;
