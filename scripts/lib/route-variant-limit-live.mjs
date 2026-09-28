import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyRouteVariantLimit(database, tripId) {
  async function plans() {
    const result = await database
      .from("route_variants")
      .select("id,color,is_primary,version,days_version,items_version,content_version")
      .eq("trip_id", tripId);
    assert.equal(result.error, null, "Plan limit fixture could not be read.");
    return result.data;
  }

  async function create(duplicate, name) {
    const source = (await plans()).find((plan) => plan.is_primary);
    assert.ok(source);
    return database.rpc("create_route_variant_v3", {
      duplicate_content: duplicate,
      expected_source_content_version: source.content_version,
      expected_source_days_version: source.days_version,
      expected_source_items_version: source.items_version,
      expected_source_version: source.version,
      source_variant_id: source.id,
      target_operation_id: randomUUID(),
      target_trip_id: tripId,
      variant_color: source.color,
      variant_name: name,
    });
  }

  assert.equal((await plans()).length, 1);
  for (let number = 2; number <= 5; number++) {
    const result = await create(number % 2 === 1, `Limit Plan ${number}`);
    assert.equal(result.error, null, `Plan ${number} should be allowed.`);
    assert.ok(result.data?.variantId);
    assert.equal((await plans()).length, number);
  }
  for (const duplicate of [false, true]) {
    const result = await create(duplicate, duplicate ? "Sixth duplicate" : "Sixth blank");
    assert.match(result.error?.message ?? "", /VARIANT_LIMIT_REACHED/);
    assert.equal((await plans()).length, 5, "Rejected sixth Plan left a partial variant.");
  }
}
