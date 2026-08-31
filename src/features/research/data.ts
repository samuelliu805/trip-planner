import { getBackendCapabilities, getRelationalDatabase } from "@/platform/composition/server";
import {
  ownerAttachmentsFromRows,
  type OwnerAttachmentRow,
} from "@/features/attachments/owner-attachment-records";

import type {
  PlanResearchItem,
  ResearchPlanItem,
  ResearchPlanApplication,
  ResearchPlanSnapshot,
  VariantResearchSelection,
  ResearchItem,
  StoredResearchPlace,
} from "./types";
import type { AppRow } from "@/platform/contracts/database";

export type ResearchItemRow = AppRow<"research_items"> & {
  attachments?: OwnerAttachmentRow[] | null;
  destination_place: StoredResearchPlace | null;
  location_place: StoredResearchPlace | null;
  origin_place: StoredResearchPlace | null;
};

const researchPlaceSelection =
  "location_place:places!research_items_location_place_trip_fkey(id, source, google_place_id, display_name, formatted_address, latitude, longitude, locality_name, locality_kind, country_code, administrative_area_name, locality_source), origin_place:places!research_items_origin_place_trip_fkey(id, source, google_place_id, display_name, formatted_address, latitude, longitude, locality_name, locality_kind, country_code, administrative_area_name, locality_source), destination_place:places!research_items_destination_place_trip_fkey(id, source, google_place_id, display_name, formatted_address, latitude, longitude, locality_name, locality_kind, country_code, administrative_area_name, locality_source)";
const researchAttachmentSelection =
  "attachments:asset_links!asset_links_research_trip_fkey(id, public_ref, display_filename, sort_order, include_in_share, draft_session_id, created_at, asset:assets!asset_links_asset_owner_fkey(media_kind, mime_type, byte_size, status, width, height, duration_seconds))";

export function getResearchItemSelection() {
  return [
    "*",
    ...(getBackendCapabilities().signedUrls ? [researchAttachmentSelection] : []),
    researchPlaceSelection,
  ].join(", ");
}

export function researchItemFromRow(row: ResearchItemRow): ResearchItem {
  return { ...row, attachments: ownerAttachmentsFromRows(row.attachments) };
}

export async function getResearchPlanSnapshot(tripId: string, variantId: string) {
  const database = await getRelationalDatabase();
  const [daysResult, itemsResult] = await Promise.all([
    database
      .from("trip_days")
      .select("id, date, day_number")
      .eq("variant_id", variantId)
      .order("day_number", { ascending: true }),
    database
      .from("itinerary_items")
      .select("id, day_id, details, place_id, price_amount, price_currency, title, type")
      .eq("trip_id", tripId)
      .eq("variant_id", variantId)
      .order("day_id", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);
  if (daysResult.error || itemsResult.error)
    return {
      data: null,
      error:
        daysResult.error?.message ??
        itemsResult.error?.message ??
        "The selected Plan could not be loaded.",
    };

  const itemsByDay = new Map<string, ResearchPlanItem[]>();
  for (const { day_id, ...item } of itemsResult.data ?? []) {
    const items = itemsByDay.get(day_id) ?? [];
    items.push(item);
    itemsByDay.set(day_id, items);
  }
  return {
    data: {
      days: (daysResult.data ?? []).map((day) => ({
        date: day.date,
        dayNumber: day.day_number,
        id: day.id,
        items: itemsByDay.get(day.id) ?? [],
      })),
      variantId,
    } satisfies ResearchPlanSnapshot,
    error: null,
  };
}

export async function getCompareItems(tripId: string) {
  const database = await getRelationalDatabase();
  const { data, error } = await database
    .from("research_items")
    .select<ResearchItemRow>(getResearchItemSelection())
    .eq("trip_id", tripId)
    .order("observed_at", { ascending: false });
  return {
    data: (data ?? []).map((row) => researchItemFromRow(row)),
    error: error?.message ?? null,
  };
}

export async function getPlanResearchItems(tripId: string) {
  const database = await getRelationalDatabase();
  const { data, error } = await database.from("research_items").select("*").eq("trip_id", tripId);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) satisfies PlanResearchItem[], error: null };
}

export async function getResearchPlanState(tripId: string, variantId: string) {
  const database = await getRelationalDatabase();
  const [selectionsResult, applicationsResult, currentApplicationsResult] = await Promise.all([
    database
      .from("variant_research_selections")
      .select("*")
      .eq("trip_id", tripId)
      .eq("route_variant_id", variantId)
      .order("updated_at", { ascending: false }),
    database
      .from("research_plan_applications")
      .select("*")
      .eq("trip_id", tripId)
      .eq("route_variant_id", variantId)
      .order("applied_at", { ascending: false })
      .limit(100),
    database.rpc("current_research_plan_application_ids", {
      target_trip_id: tripId,
      target_variant_id: variantId,
    }),
  ]);
  return {
    applications: (applicationsResult.data ?? []) as ResearchPlanApplication[],
    currentApplicationIds: currentApplicationsResult.data ?? [],
    error:
      selectionsResult.error?.message ??
      applicationsResult.error?.message ??
      currentApplicationsResult.error?.message ??
      null,
    selections: (selectionsResult.data ?? []) as VariantResearchSelection[],
  };
}
