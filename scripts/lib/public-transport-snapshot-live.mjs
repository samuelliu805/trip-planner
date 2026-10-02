import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyPublicTransportSnapshot(database, tripId) {
  const read = (result) => {
    assert.ifError(result.error);
    return result.data;
  };
  const variant = read(
    await database.from("route_variants").select("id,version").eq("trip_id", tripId),
  )[0];
  const itemId = randomUUID();
  async function save(mode, title, version) {
    const day = read(
      await database.from("trip_days").select("id,items_version").eq("variant_id", variant.id),
    )[0];
    return read(
      await database.rpc("save_itinerary_item_v3", {
        expected_items_version: day.items_version,
        expected_version: version,
        ordered_item_ids: null,
        requested_draft_session_id: null,
        requested_item: {
          title,
          type: "transport",
          notes: "Private booking note",
          details: { mode },
        },
        requested_links: [],
        target_day_id: day.id,
        target_item_id: itemId,
        target_operation_id: randomUUID(),
        target_trip_id: tripId,
        target_variant_id: variant.id,
      }),
    );
  }
  await save("self_driving", "Coastal transfer", null);
  const current = read(
    await database.from("route_variants").select("version").eq("id", variant.id),
  )[0];
  const share = read(
    await database.rpc("create_share_page_v4", {
      expected_variant_version: current.version,
      target_operation_id: randomUUID(),
      target_variant_id: variant.id,
    }),
  );
  const published = read(
    await database.rpc("get_public_share_page_v3", { shared_token: share.publicToken }),
  );
  const item = published.days[0].items.find((i) => i.title === "Coastal transfer");
  const privatePage = read(
    await database.rpc("create_share_page_v4", {
      expected_variant_version: current.version,
      target_operation_id: randomUUID(),
      target_variant_id: variant.id,
      requested_show_notes: false,
      requested_share_title: "Custom share title",
      requested_default_view: "table",
      requested_template_id: "journal",
    }),
  );
  assert.equal(
    item.transport.mode,
    "self_driving",
    "Mode-only transfer retains canonical mode despite a custom title.",
  );
  const privateItem = read(
    await database.from("itinerary_items").select("version").eq("id", itemId),
  )[0];
  await save("bus", "Updated coastal transfer", privateItem.version);
  const refreshed = read(
    await database.rpc("get_public_share_page_v3", { shared_token: share.publicToken }),
  );
  const updated = refreshed.days[0].items.find((i) => i.ref === item.ref);
  assert.equal(updated.title, "Updated coastal transfer", "Saving updates the same public link.");
  assert.equal(updated.transport.mode, "bus", "Transport mode updates without republishing.");
  assert.equal(
    refreshed.days[0].items.some((i) => i.title === "Coastal transfer"),
    false,
  );
  assert.equal(
    refreshed.settings.defaultView,
    "overview",
    "New pages open in Overview by default.",
  );
  const privateProjection = read(
    await database.rpc("get_public_share_page_v3", {
      shared_token: privatePage.publicToken,
    }),
  );
  assert.ok(privateProjection.days[0].items.some((i) => i.title === "Updated coastal transfer"));
  assert.equal(
    JSON.stringify(privateProjection).includes("Private booking note"),
    false,
    "Per-page hidden fields stay private after synchronization.",
  );
  assert.equal(privateProjection.metadata.title, "Custom share title");
  assert.equal(privateProjection.settings.defaultView, "table");
  assert.equal(privateProjection.settings.templateId, "journal");
  const ownerPage = read(
    await database.rpc("owner_share_page_v2", {
      target_share_page_id: share.id,
    }),
  );
  assert.notEqual(
    ownerPage.snapshotHash,
    share.snapshotHash,
    "Image source hashes follow saved content.",
  );
  assert.equal(
    ownerPage.version,
    share.version,
    "Content sync preserves the share settings version.",
  );
  console.log(
    "Public transport modes, per-page privacy and automatic share synchronization passed.",
  );
}
