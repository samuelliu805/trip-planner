import { z } from "zod";
import { ideaLocationSchema, itemLocationSchema } from "./place-schemas";

const id = z.uuid();
const revision = z.string().min(1).max(100);
const key = z.string().min(8).max(128);
const text = z.string().max(5000);
const name = z.string().trim().min(1).max(160);
const date = z.iso.date();
const timezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Use an IANA time zone.");
const page = { cursor: id.optional(), limit: z.number().int().min(1).max(50).default(25) };
const idea = z
  .object({
    name,
    region: z.string().max(200).optional(),
    notes: text.optional(),
    reason: text.optional(),
    tags: z.array(z.string().max(60)).max(20).optional(),
    source_url: z
      .url()
      .max(2000)
      .refine((url) => /^https?:\/\//.test(url))
      .optional(),
    source_kind: z.enum(["user", "web", "chat", "screenshot"]).default("user"),
    stable_place_id: z.string().min(3).max(512).optional(),
    location: ideaLocationSchema.optional(),
  })
  .strict();
const tripPatch = {
  title: name.optional(),
  timezone: timezone.optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  start_date: date.nullable().optional(),
  end_date: date.nullable().optional(),
  day_count: z.number().int().min(1).max(366).optional(),
  archived: z.boolean().optional(),
};
const itemFields = z
  .object({
    title: name.optional(),
    type: z.enum(["activity", "meal"]).optional(),
    notes: text.nullable().optional(),
    startTime: z
      .string()
      .regex(
        /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
        "Use a valid 24-hour time (HH:mm or HH:mm:ss).",
      )
      .nullable()
      .optional(),
    endTime: z
      .string()
      .regex(
        /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
        "Use a valid 24-hour time (HH:mm or HH:mm:ss).",
      )
      .nullable()
      .optional(),
    scheduleKind: z
      .enum(["none", "all_day", "period", "approximate", "exact", "range"])
      .describe(
        "Meals: none/all_day without times, or exact with startTime only. Activities also support range with both times. period/approximate require the web editor. Updates merge with stored fields; clear obsolete times explicitly.",
      )
      .optional(),
    location: itemLocationSchema.nullable().optional(),
  })
  .strict();
const change = z
  .object({
    op: z.enum(["add", "update", "move", "remove"]),
    item_id: id.optional(),
    day_id: id.optional(),
    idea_id: id.optional(),
    fields: itemFields.optional(),
  })
  .strict();

export const toolSchemas = {
  account_get: z.object({}).strict(),
  place_search: z
    .object({
      query: z.string().trim().min(1).max(80),
      limit: z.number().int().min(1).max(5).default(5),
    })
    .strict(),
  place_resolve: z
    .object({
      provider_place_id: z.string().regex(/^[A-Za-z0-9_-]{1,300}$/),
      search_id: id.optional(),
    })
    .strict(),
  trip_list: z.object({ ...page, include_archived: z.boolean().default(false) }).strict(),
  trip_get: z
    .object({
      trip_id: id,
      section: z.enum(["summary", "days", "items"]).default("summary"),
      day_id: id.optional(),
      variant_id: id.optional(),
      ...page,
    })
    .strict(),
  trip_create: z
    .object({
      idempotency_key: key,
      title: name,
      timezone,
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("USD"),
      day_count: z.number().int().min(1).max(366).default(3),
      start_date: date.optional(),
      end_date: date.optional(),
    })
    .strict(),
  trip_update: z
    .object({
      trip_id: id,
      expected_revision: revision,
      idempotency_key: key,
      patch: z.object(tripPatch).strict(),
    })
    .strict(),
  trip_archive: z
    .object({ trip_id: id, expected_revision: revision, idempotency_key: key })
    .strict(),
  idea_search: z
    .object({
      ...page,
      query: z.string().max(200).default(""),
      include_archived: z.boolean().default(false),
    })
    .strict(),
  idea_save_many: z.object({ idempotency_key: key, ideas: z.array(idea).min(1).max(50) }).strict(),
  idea_update: z
    .object({
      idea_id: id,
      expected_revision: revision,
      idempotency_key: key,
      patch: z
        .object({
          name: name.optional(),
          region: z.string().max(200).nullable().optional(),
          notes: text.nullable().optional(),
          reason: text.nullable().optional(),
          tags: z.array(z.string().max(60)).max(20).optional(),
          archived: z.boolean().optional(),
          location: ideaLocationSchema.nullable().optional(),
        })
        .strict(),
    })
    .strict(),
  idea_archive: z
    .object({ idea_id: id, expected_revision: revision, idempotency_key: key })
    .strict(),
  itinerary_apply_changes: z
    .object({
      trip_id: id,
      expected_revision: revision,
      idempotency_key: key,
      dry_run: z.boolean().default(false),
      preview_id: id.optional(),
      changes: z.array(change).min(1).max(50).optional(),
    })
    .strict(),
  change_undo: z.object({ change_id: id, idempotency_key: key }).strict(),
};
export type ToolName = keyof typeof toolSchemas;
export function isToolName(value: string): value is ToolName {
  return Object.hasOwn(toolSchemas, value);
}

export function canonicalUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  for (const param of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|igshid)$/i.test(param)) url.searchParams.delete(param);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

export function parseToolInput(tool: ToolName, input: unknown) {
  const parsed = toolSchemas[tool].parse(input);
  if (tool === "idea_save_many" && "ideas" in parsed) {
    return {
      ...parsed,
      ideas: parsed.ideas.map((item) => ({
        ...item,
        normalized_url: item.source_url ? canonicalUrl(item.source_url) : undefined,
      })),
    };
  }
  return parsed;
}
