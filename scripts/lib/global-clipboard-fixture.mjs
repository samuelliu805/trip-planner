import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function createGlobalClipboardFixture(database, tripId, variantId) {
  for (const title of ["Clipboard museum", "Clipboard garden"]) {
    const day = await database
      .from("trip_days")
      .select("id,items_version")
      .eq("variant_id", variantId)
      .eq("day_number", 1)
      .single();
    assert.ifError(day.error);
    const id = randomUUID();
    const saved = await database.rpc("save_itinerary_item_v3", {
      expected_items_version: day.data.items_version,
      expected_version: null,
      ordered_item_ids: null,
      requested_draft_session_id: null,
      requested_item: { title, type: "activity", notes: "Cross-Plan clipboard fixture" },
      requested_links: [{ label: "Tickets", url: "https://example.invalid/tickets", sortOrder: 0 }],
      target_day_id: day.data.id,
      target_item_id: id,
      target_operation_id: id,
      target_trip_id: tripId,
      target_variant_id: variantId,
    });
    assert.ifError(saved.error);
  }
}
