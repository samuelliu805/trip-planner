import { z } from "zod";
import { AiError } from "./service";
import type { Json } from "@/types/database";

export type DataRegion = "global" | "cn";
export const resourceId = z.union([z.uuid(), z.string().regex(/^(global|cn):[0-9a-f-]{36}$/i)]);
export const pageCursor = z.union([resourceId, z.string().regex(/^page:[0-9a-f-]{36}$/i)]);
const identifiers = new Set([
  "id",
  "trip_id",
  "trip_ids",
  "idea_id",
  "saved_idea_id",
  "preview_id",
  "change_id",
  "search_id",
  "selection_id",
  "day_id",
  "variant_id",
  "item_id",
  "place_id",
  "cursor",
  "next_cursor",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function handleRegion(value: string): DataRegion {
  if (uuid.test(value)) return "global"; // Published Global IDs remain valid.
  const match = /^(global|cn):(.+)$/.exec(value);
  if (!match || !uuid.test(match[2])) throw new AiError("INVALID_RESOURCE_HANDLE");
  return match[1] as DataRegion;
}

/** Only identity fields are rewritten; user text, destination and provider IDs are data. */
export function mapResourceIds(value: Json, map: (id: string) => string, key = ""): Json {
  if (typeof value === "string" && identifiers.has(key)) return map(value);
  if (Array.isArray(value)) return value.map((item) => mapResourceIds(item, map, key));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [
        field,
        mapResourceIds(item ?? null, map, field),
      ]),
    );
  return value;
}

export function regionalInput(input: Json, region: DataRegion): Record<string, unknown> {
  return mapResourceIds(input, (id) => {
    if (id.startsWith("page:")) throw new AiError("CURSOR_INVALID");
    if (handleRegion(id) !== region) throw new AiError("CROSS_REGION_OPERATION");
    return id.replace(/^(global|cn):/, "");
  }) as Record<string, unknown>;
}

export function regionalOutput(value: Json, region: DataRegion, origin: string): Json {
  const visit = (value: Json): Json => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          key === "url" && typeof item === "string" && item.startsWith("/")
            ? new URL(item, origin).href
            : visit(item ?? null),
        ]),
      );
    return value;
  };
  const result = visit(
    mapResourceIds(value, (id) => (region === "cn" && uuid.test(id) ? `cn:${id}` : id)),
  );
  return result && typeof result === "object" && !Array.isArray(result)
    ? { ...result, data_region: region }
    : result;
}
