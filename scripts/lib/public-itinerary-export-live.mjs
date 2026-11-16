import assert from "node:assert/strict";

export async function verifyPublicItineraryExports(baseUrl, token, { title, forbidden = [] } = {}) {
  for (const format of ["json", "csv"]) {
    const response = await fetch(new URL(`/share/${token}/export?format=${format}`, baseUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200, `Anonymous ${format} export failed.`);
    assert.equal(
      response.headers.has("set-cookie"),
      false,
      "Public exports must not refresh auth.",
    );
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.match(
      response.headers.get("content-type"),
      format === "json" ? /application\/json/ : /text\/csv/,
    );
    const body = await response.text();
    if (format === "json") {
      const data = JSON.parse(body);
      assert.equal(data.schemaVersion, 1);
      assert.ok(Array.isArray(data.days));
      if (title) assert.equal(data.trip.title, title);
    } else {
      assert.ok(body.startsWith('"schema_version","trip_title"'));
      if (title) assert.ok(body.includes(title));
    }
    for (const privateValue of forbidden) {
      assert.equal(body.includes(privateValue), false, "Public export exposed a private value.");
    }
  }
  const invalid = await fetch(new URL(`/share/${token}/export?format=xml`, baseUrl), {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(invalid.status, 400);
}
