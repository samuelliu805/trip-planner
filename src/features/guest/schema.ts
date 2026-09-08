import { z } from "zod";

import { itineraryItemTypes, placeSnapshotSchema } from "../itinerary/item-schema.ts";
import type { PlannerWorkspace } from "../itinerary/types.ts";
import type { Trip } from "../../platform/contracts/trips.ts";

export const guestDraftSchemaVersion = 1 as const;
export type GuestRegion = "cn" | "global";

const linkSchema = z.object({
  id: z.uuid(),
  item_id: z.uuid(),
  label: z.string().max(80),
  sort_order: z.number().int().min(0),
  url: z.url().refine((url) => /^https?:\/\//i.test(url), "Use an HTTP(S) URL."),
});

const persistedPlaceSchema = z.intersection(z.object({ id: z.uuid() }), placeSnapshotSchema);

const itemSchema = z
  .object({
    attachments: z.array(z.never()).max(0).optional(),
    booking_url: z
      .url()
      .refine((url) => /^https?:\/\//i.test(url), "Use an HTTP(S) URL.")
      .nullable(),
    created_at: z.iso.datetime(),
    day_id: z.uuid(),
    details: z.record(z.string(), z.json()),
    end_time: z.string().nullable(),
    id: z.uuid(),
    links: z.array(linkSchema).max(20).optional(),
    notes: z.string().max(5000).nullable(),
    place: persistedPlaceSchema.nullable().optional(),
    place_id: z.uuid().nullable(),
    price_amount: z.number().finite().min(0).max(9_999_999_999.99).nullable(),
    price_currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    schedule_kind: z.enum(["none", "all_day", "period", "approximate", "exact", "range"]),
    schedule_text: z.string().nullable(),
    sort_order: z.number().int().min(0),
    start_time: z.string().nullable(),
    title: z.string().trim().min(1).max(200),
    trip_id: z.uuid(),
    type: z.enum(itineraryItemTypes),
    updated_at: z.iso.datetime(),
    version: z.number().int().positive().optional().default(1),
    variant_id: z.uuid(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.place_id !== (item.place?.id ?? null))
      context.addIssue({
        code: "custom",
        message: "Guest item place relationship is inconsistent.",
      });
    if (item.links?.some((link) => link.item_id !== item.id))
      context.addIssue({
        code: "custom",
        message: "Guest item link relationship is inconsistent.",
      });
    if ((item.price_amount === null) !== (item.price_currency === null))
      context.addIssue({ code: "custom", message: "Guest item price is incomplete." });
  });

const daySchema = z
  .object({
    content_version: z.number().int().positive().optional().default(1),
    date: z.iso.date().nullable(),
    day_number: z.number().int().min(1).max(366),
    id: z.uuid(),
    items: z.array(itemSchema).max(2000),
    items_version: z.number().int().positive().optional().default(1),
    notes: z.string().nullable(),
    title: z.string().nullable(),
    variant_id: z.uuid(),
    version: z.number().int().positive().optional().default(1),
  })
  .strict();

const workspaceSchema = z
  .object({
    days: z.array(daySchema).min(1).max(366),
    routePlans: z.array(z.never()).max(0),
    variant: z
      .object({
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        content_version: z.number().int().positive().optional().default(1),
        days_version: z.number().int().positive().optional().default(1),
        id: z.uuid(),
        is_primary: z.literal(true),
        items_version: z.number().int().positive().optional().default(1),
        name: z.string().min(1).max(80),
        trip_id: z.uuid(),
        version: z.number().int().positive().optional().default(1),
      })
      .strict(),
  })
  .strict();

const tripSchema = z
  .object({
    content_version: z.number().int().positive().optional().default(1),
    created_at: z.iso.datetime(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    day_count: z.number().int().min(1).max(366),
    end_date: z.iso.date().nullable(),
    id: z.uuid(),
    owner_id: z.literal("guest"),
    role: z.literal("owner").optional().default("owner"),
    start_date: z.iso.date().nullable(),
    status: z.literal("open"),
    timezone: z.string().min(1).max(120),
    title: z.string().trim().min(1).max(120),
    updated_at: z.iso.datetime(),
    version: z.number().int().positive().optional().default(1),
  })
  .strict();

export const guestTripDraftSchema = z
  .object({
    createdAt: z.iso.datetime(),
    draftId: z.uuid(),
    region: z.enum(["cn", "global"]),
    revision: z.number().int().min(0),
    schemaVersion: z.literal(guestDraftSchemaVersion),
    trip: tripSchema,
    updatedAt: z.iso.datetime(),
    workspace: workspaceSchema,
  })
  .strict()
  .superRefine((draft, context) => {
    const dayIds = draft.workspace.days.map(({ id }) => id);
    const items = draft.workspace.days.flatMap(({ items }) => items);
    const itemIds = items.map(({ id }) => id);
    const linkIds = items.flatMap((item) => item.links?.map(({ id }) => id) ?? []);
    const idsMatch =
      draft.trip.id === draft.draftId &&
      draft.workspace.variant.trip_id === draft.draftId &&
      draft.workspace.days.every(
        (day) =>
          day.variant_id === draft.workspace.variant.id &&
          day.items.every(
            (item) =>
              item.trip_id === draft.draftId &&
              item.variant_id === draft.workspace.variant.id &&
              item.day_id === day.id,
          ),
      );
    if (!idsMatch)
      context.addIssue({ code: "custom", message: "Guest draft relationships are inconsistent." });
    if (
      new Set(dayIds).size !== dayIds.length ||
      new Set(itemIds).size !== itemIds.length ||
      new Set(linkIds).size !== linkIds.length
    )
      context.addIssue({ code: "custom", message: "Guest draft identifiers must be unique." });
    if (draft.trip.day_count !== draft.workspace.days.length)
      context.addIssue({ code: "custom", message: "Guest draft day count is inconsistent." });
    const expectedProvider = draft.region === "cn" ? "amap" : "google";
    if (items.some((item) => item.place && item.place.provider !== expectedProvider))
      context.addIssue({
        code: "custom",
        message: "Guest place provider does not match the deployment region.",
      });
  });

export type GuestTripDraft = Omit<z.infer<typeof guestTripDraftSchema>, "trip" | "workspace"> & {
  trip: Trip;
  workspace: PlannerWorkspace;
};

export const guestIntentSchema = z.object({
  action: z.enum(["attachment", "save", "share"]),
  createdAt: z.iso.datetime(),
  draftId: z.uuid(),
  itemId: z.uuid().optional(),
});
export type GuestIntent = z.infer<typeof guestIntentSchema>;

export const guestImportMarkerSchema = z.object({
  draftId: z.uuid(),
  importedAt: z.iso.datetime(),
  intent: guestIntentSchema.nullable().optional(),
  tripId: z.uuid(),
});
export type GuestImportMarker = z.infer<typeof guestImportMarkerSchema>;

/** Version 0 was the private prototype shape. It gains an explicit revision during migration. */
const guestTripDraftV0Schema = z.object({
  createdAt: z.iso.datetime(),
  draftId: z.uuid(),
  region: z.enum(["cn", "global"]),
  schemaVersion: z.literal(0),
  trip: tripSchema,
  updatedAt: z.iso.datetime(),
  workspace: workspaceSchema,
});

export function migrateGuestTripDraft(value: unknown): GuestTripDraft {
  const current = guestTripDraftSchema.safeParse(value);
  if (current.success) return current.data as GuestTripDraft;
  const legacy = guestTripDraftV0Schema.safeParse(value);
  if (legacy.success)
    return guestTripDraftSchema.parse({
      ...legacy.data,
      revision: 0,
      schemaVersion: guestDraftSchemaVersion,
    }) as GuestTripDraft;
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    typeof value.schemaVersion === "number" &&
    value.schemaVersion > guestDraftSchemaVersion
  )
    throw new GuestDraftValidationError("incompatible", "This draft was created by a newer app.");
  throw new GuestDraftValidationError("corrupt", "The saved local draft is damaged.");
}

export class GuestDraftValidationError extends Error {
  readonly code: "corrupt" | "incompatible";

  constructor(code: "corrupt" | "incompatible", message: string) {
    super(message);
    this.code = code;
  }
}
