/* eslint-disable @typescript-eslint/no-explicit-any -- Assertions inspect heterogeneous business RPC JSON. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type pg from "pg";
import { invokeTool, type AiAuthorization, type Rpc } from "./service";
import { createLookupProvider } from "./places-provider";
import { createPlacesToolRunner } from "./places-service";
import { handleMcp } from "./mcp";

const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const scopes = ["trips:read", "trips:write", "ideas:read", "ideas:write", "places:read"];
type Grant = { authorization: AiAuthorization; token: { accessToken: string } };
type Dependencies = {
  pool: pg.Pool;
  rpc: Rpc;
  webA: Rpc;
  webB: Rpc;
  issue: (actor?: string, scopes?: string[]) => Promise<Grant>;
  config: { resource: string; origin: string; issuer: string; rateLimit: number };
  originalFetch: typeof fetch;
};
const limits = { minute: 30, daily: 1000, globalDaily: 10000 };
const value = (input: unknown): any => input;

export function registerPlaceIntegrationTests({
  pool,
  rpc,
  webA,
  webB,
  issue,
  config,
  originalFetch,
}: Dependencies) {
  const providerId = process.env.MCP_TEST_PROVIDER === "cloudbase" ? "amap" : "google";
  function fixture() {
    const calls: Array<{ id: string; session: string; operation: string }> = [];
    const key = "test-server-only-places-key";
    const provider = createLookupProvider(providerId, key, async (input, init) => {
      const url = new URL(String(input));
      assert.equal(init?.redirect, "error");
      const suggest = url.pathname.endsWith(":autocomplete") || url.pathname.endsWith("/text");
      const id = suggest
        ? ""
        : providerId === "google"
          ? url.pathname.split("/").at(-1)!
          : url.searchParams.get("id")!;
      let session = "";
      if (providerId === "google") {
        assert.equal(url.origin, "https://places.googleapis.com");
        assert.equal(new Headers(init?.headers).get("X-Goog-Api-Key"), key);
        const body = suggest ? JSON.parse(String(init?.body)) : {};
        session = suggest ? body.sessionToken : url.searchParams.get("sessionToken")!;
        if (!suggest)
          assert.equal(
            new Headers(init?.headers).get("X-Goog-FieldMask"),
            "id,displayName,formattedAddress,location,addressComponents",
          );
      } else {
        assert.equal(url.origin, "https://restapi.amap.com");
        assert.equal(url.searchParams.get("key"), key);
      }
      calls.push({ id, session, operation: suggest ? "search" : "resolve" });
      if (id === "FAIL") return Response.json({ error: { message: key } }, { status: 403 });
      if (providerId === "google")
        return Response.json(
          suggest
            ? {
                suggestions: ["GARDEN", "MUSEUM"].map((placeId) => ({
                  placePrediction: {
                    placeId,
                    structuredFormat: {
                      mainText: { text: `Provider description ${placeId}` },
                      secondaryText: { text: "Provider-only address" },
                    },
                  },
                })),
              }
            : {
                id,
                displayName: { text: `Provider description ${id}` },
                formattedAddress: "Provider-only address",
                location: { latitude: 35.01, longitude: 135.77 },
              },
        );
      return Response.json({
        status: "1",
        pois: (suggest ? ["GARDEN", "MUSEUM"] : [id]).map((placeId) => ({
          id: placeId,
          name: `Provider description ${placeId}`,
          address: "Provider-only address",
          cityname: "北京",
          location: "116.397,39.908",
        })),
      });
    });
    const runner = createPlacesToolRunner(rpc, provider, limits);
    return { calls, provider, runner };
  }
  async function resetUsage() {
    await pool.query(
      "DELETE FROM app_private.ai_place_usage; DELETE FROM app_private.ai_rate_buckets WHERE key LIKE 'places:%'",
    );
  }
  async function freshTrip(call: (tool: string, args: unknown) => Promise<any>) {
    const trip = await call("trip_create", {
      title: "Map integration",
      timezone: "Asia/Tokyo",
      idempotency_key: randomUUID(),
    });
    return call("trip_get", { trip_id: trip.trip.id, section: "days" });
  }

  test("Maps scope, credentials, search ownership and real MCP annotations are enforced before provider calls", async () => {
    await resetUsage();
    const grant = await issue(A, scopes);
    const other = await issue(B, scopes);
    const sameUser = await issue(A, scopes);
    const noPlaces = await issue();
    const { runner, calls } = fixture();
    const call = (tool: string, args: unknown, auth = grant.authorization) =>
      invokeTool(rpc, tool, args, auth, runner).then(value);
    await assert.rejects(
      call("place_search", { query: "Kyoto garden" }, noPlaces.authorization),
      /INSUFFICIENT_SCOPE/,
    );
    await assert.rejects(
      call(
        "place_search",
        { query: "Kyoto garden" },
        { ...grant.authorization, issuer: "https://wrong.test" },
      ),
      /INVALID_TOKEN/,
    );
    await assert.rejects(call("place_search", { query: "Kyoto garden", _limits: { minute: 600 } }));
    assert.equal(calls.length, 0);
    const search = await call("place_search", { query: "Kyoto garden", limit: 2 });
    assert.equal(search.candidates.length, 2);
    assert.ok(search.candidates[0].maps_url.startsWith("https://"));
    for (const auth of [other.authorization, sameUser.authorization])
      await assert.rejects(
        call("place_resolve", { search_id: search.search_id, provider_place_id: "GARDEN" }, auth),
        /PLACE_LOOKUP_EXPIRED/,
      );
    await assert.rejects(
      call("place_resolve", { search_id: search.search_id, provider_place_id: "NOTINCANDIDATES" }),
      /PLACE_NOT_IN_SEARCH/,
    );
    assert.equal(calls.length, 1);
    const selected = await call("place_resolve", {
      search_id: search.search_id,
      provider_place_id: "GARDEN",
    });
    assert.equal(selected.place.coordinateSystem, "wgs84");
    assert.equal(selected.place.providerPlaceId, "GARDEN");
    if (providerId === "google") assert.equal(calls[0].session, calls[1].session);
    else
      assert.ok(
        Math.abs(selected.place.longitude - 116.397) > 0.001,
        "AMap GCJ02 must become WGS84",
      );
    await assert.rejects(
      call("place_resolve", { search_id: search.search_id, provider_place_id: "GARDEN" }),
      /PLACE_LOOKUP_EXPIRED/,
    );
    assert.equal(calls.length, 2);
    const stolen = await call(
      "idea_save_many",
      {
        idempotency_key: randomUUID(),
        ideas: [{ name: "Stolen selection", location: { selection_id: selected.selection_id } }],
      },
      other.authorization,
    );
    assert.equal(stolen.created.length, 0);
    assert.equal(stolen.failed[0].code, "PLACE_LOOKUP_EXPIRED");
    const denied = await webA("ai_place_finish_v1", {
      access_hash: grant.authorization.hash,
      expected_resource: config.resource,
      expected_issuer: config.issuer,
      lookup_id: selected.selection_id,
      result: { latitude: 0, longitude: 0 },
    });
    assert.equal(denied.error?.code, "42501");
    const listed = await handleMcp(
      new Request(config.resource, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${grant.token.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      rpc,
      config,
      runner,
    );
    const tools = value(await listed.json()).result.tools;
    assert.equal(tools.length, 14);
    for (const name of ["place_search", "place_resolve"])
      assert.deepEqual(tools.find((tool: any) => tool.name === name).annotations, {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    assert.equal(
      JSON.stringify({ search, selected }).includes("test-server-only-places-key"),
      false,
    );
  });

  test("Maps selections persist actual web place relations atomically without overwriting Idea snapshots", async () => {
    await resetUsage();
    const grant = await issue(A, scopes);
    const { runner } = fixture();
    const call = (tool: string, args: unknown) =>
      invokeTool(rpc, tool, args, grant.authorization, runner).then(value);
    const garden = await call("place_resolve", { provider_place_id: "GARDEN" });
    const museum = await call("place_resolve", { provider_place_id: "MUSEUM" });
    const saved = await call("idea_save_many", {
      idempotency_key: randomUUID(),
      ideas: [
        {
          name: "My garden",
          region: "Kyoto",
          notes: "Keep my note",
          source_url: "https://guide.test/two-places",
          location: { selection_id: garden.selection_id },
        },
        {
          name: "My museum",
          region: "Kyoto",
          source_url: "https://guide.test/two-places?utm_source=agent",
          location: { selection_id: museum.selection_id },
        },
      ],
    });
    assert.equal(saved.created.length, 2);
    assert.equal(saved.duplicates.length, 0);
    assert.equal(saved.created[0].location_status, "resolved");
    assert.equal(saved.created[0].location_ref.latitude, undefined);
    assert.equal(JSON.stringify(saved.created).includes("Provider description"), false);
    const duplicated = await call("idea_save_many", {
      idempotency_key: randomUUID(),
      ideas: [
        {
          name: "Do not replace",
          notes: "Do not replace",
          location: { selection_id: garden.selection_id },
        },
      ],
    });
    assert.equal(duplicated.duplicates[0].idea_id, saved.created[0].id);
    const trip = await freshTrip(call);
    const base = { trip_id: trip.trip.id, expected_revision: trip.revision };
    const changes = saved.created.map((idea: any, index: number) => ({
      op: "add",
      day_id: trip.days[0].id,
      idea_id: idea.id,
      fields: { location: { selection_id: [garden, museum][index].selection_id } },
    }));
    await assert.rejects(
      call("itinerary_apply_changes", {
        ...base,
        dry_run: true,
        idempotency_key: randomUUID(),
        changes: [{ ...changes[0], fields: { location: { selection_id: museum.selection_id } } }],
      }),
      /PLACE_SELECTION_MISMATCH/,
    );
    const preview = await call("itinerary_apply_changes", {
      ...base,
      dry_run: true,
      changes,
      idempotency_key: randomUUID(),
    });
    assert.equal(
      (await pool.query("SELECT count(*) FROM public.places WHERE trip_id=$1", [trip.trip.id]))
        .rows[0].count,
      "0",
    );
    assert.equal(
      (await call("trip_get", { trip_id: trip.trip.id, section: "items" })).items.length,
      0,
    );
    const committed = await call("itinerary_apply_changes", {
      ...base,
      preview_id: preview.preview_id,
      idempotency_key: randomUUID(),
    });
    const web = value(
      await invokeTool(webA, "trip_get", { trip_id: trip.trip.id, section: "items" }),
    );
    assert.equal(web.items.length, 2);
    for (const item of web.items) {
      assert.ok(item.place_id);
      assert.equal(item.place.id, item.place_id);
      assert.equal(item.place.provider, providerId);
      assert.equal(item.place.coordinateSystem, "wgs84");
      assert.equal(item.place.latitude, garden.place.latitude);
      assert.ok(saved.created.some((idea: any) => idea.id === item.saved_idea_id));
    }
    await call("idea_update", {
      idea_id: saved.created[0].id,
      expected_revision: saved.created[0].revision,
      patch: { notes: "Later personal note" },
      idempotency_key: randomUUID(),
    });
    const same = await call("trip_get", { trip_id: trip.trip.id, section: "items" });
    assert.equal(
      same.items.find((item: any) => item.saved_idea_id === saved.created[0].id).notes,
      "Keep my note",
    );
    const second = await freshTrip(call);
    const secondBase = {
      trip_id: second.trip.id,
      expected_revision: second.revision,
      dry_run: true,
      idempotency_key: randomUUID(),
    };
    await assert.rejects(
      call("itinerary_apply_changes", {
        ...secondBase,
        changes: [{ op: "add", day_id: second.days[0].id, idea_id: saved.created[0].id }],
      }),
      /PLACE_RESOLUTION_REQUIRED/,
    );
    await assert.rejects(
      call("itinerary_apply_changes", {
        ...secondBase,
        changes: [
          {
            op: "add",
            day_id: second.days[0].id,
            fields: { title: "Foreign place", location: { place_id: web.items[0].place_id } },
          },
        ],
      }),
      /RESOURCE_FORBIDDEN/,
    );
    const secondPreview = await call("itinerary_apply_changes", {
      ...secondBase,
      changes: [
        {
          op: "add",
          day_id: second.days[0].id,
          idea_id: saved.created[0].id,
          fields: { location: { selection_id: garden.selection_id } },
        },
      ],
    });
    await call("itinerary_apply_changes", {
      trip_id: second.trip.id,
      expected_revision: second.revision,
      preview_id: secondPreview.preview_id,
      idempotency_key: randomUUID(),
    });
    assert.equal(
      (await call("trip_get", { trip_id: second.trip.id, section: "items" })).items[0].place
        .providerPlaceId,
      "GARDEN",
    );
    await call("change_undo", { change_id: committed.change_id, idempotency_key: randomUUID() });
    assert.equal(
      (await call("trip_get", { trip_id: trip.trip.id, section: "items" })).items.length,
      0,
    );
    const own = value(await invokeTool(webA, "idea_search", { query: "My garden" }));
    assert.equal(own.items[0].location_ref.providerPlaceId, "GARDEN");
    const audit = (
      await pool.query(
        "SELECT before_state::text || after_state::text AS body FROM app_private.ai_changes WHERE trip_id=$1",
        [trip.trip.id],
      )
    ).rows;
    assert.ok(
      audit.every(
        (row: any) =>
          !row.body.includes("Provider description") && !row.body.includes("Provider-only address"),
      ),
    );
  });

  test("Maps expired selections, provider failures and mid-request revocation cannot become usable locations", async () => {
    await resetUsage();
    const grant = await issue(A, scopes);
    const { runner, provider } = fixture();
    const call = (tool: string, args: unknown) =>
      invokeTool(rpc, tool, args, grant.authorization, runner).then(value);
    const selected = await call("place_resolve", { provider_place_id: "GARDEN" });
    const trip = await freshTrip(call);
    const base = { trip_id: trip.trip.id, expected_revision: trip.revision };
    await pool.query(
      "UPDATE app_private.ai_place_lookups SET expires_at=clock_timestamp()+interval '1 minute' WHERE id=$1",
      [selected.selection_id],
    );
    const preview = await call("itinerary_apply_changes", {
      ...base,
      dry_run: true,
      changes: [
        {
          op: "add",
          day_id: trip.days[0].id,
          fields: { title: "My label", location: { selection_id: selected.selection_id } },
        },
      ],
      idempotency_key: randomUUID(),
    });
    assert.ok(preview.expires_in_seconds <= 60 && preview.expires_in_seconds > 0);
    await pool.query(
      "UPDATE app_private.ai_place_lookups SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [selected.selection_id],
    );
    await assert.rejects(
      call("itinerary_apply_changes", {
        ...base,
        preview_id: preview.preview_id,
        idempotency_key: randomUUID(),
      }),
      /PLACE_LOOKUP_EXPIRED/,
    );
    assert.equal(
      (await call("trip_get", { trip_id: trip.trip.id, section: "items" })).items.length,
      0,
    );
    await assert.rejects(
      call("place_resolve", { provider_place_id: "FAIL" }),
      /PLACE_PROVIDER_UNAVAILABLE/,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT state FROM app_private.ai_place_lookups WHERE provider_place_id='FAIL'",
        )
      ).rows[0].state,
      "failed",
    );
    const revokeRunner = createPlacesToolRunner(
      rpc,
      {
        ...provider,
        async resolve(id, session) {
          const place = await provider.resolve(id, session);
          const connection = (
            await pool.query("SELECT connection_id FROM app_private.ai_credentials WHERE hash=$1", [
              grant.authorization.hash,
            ])
          ).rows[0].connection_id;
          const revoked = await webA("ai_connections_v1", {
            action: "revoke",
            connection_id: connection,
          });
          assert.equal(revoked.error, null);
          return place;
        },
      },
      limits,
    );
    await assert.rejects(
      invokeTool(
        rpc,
        "place_resolve",
        { provider_place_id: "MUSEUM" },
        grant.authorization,
        revokeRunner,
      ),
      /INVALID_TOKEN/,
    );
    const blocked = await webB("ai_place_cleanup_v1", { batch_size: 1 });
    assert.equal(blocked.error?.code, "42501");
    await pool.query(
      "INSERT INTO app_private.ai_place_lookups(actor,connection_id,provider,state,expires_at) SELECT $1,connection_id,$2,'failed',clock_timestamp()-interval '1 second' FROM app_private.ai_credentials WHERE hash=$3",
      [A, providerId, grant.authorization.hash],
    );
    const cleaned = await rpc("ai_place_cleanup_v1", { batch_size: 1 });
    assert.equal(value(cleaned.data).deleted_lookups, 1);
  });

  test("Maps unverified references and manual coordinates remain distinct and location edits can be undone", async () => {
    const grant = await issue(A, scopes);
    const call = (tool: string, args: unknown) =>
      invokeTool(rpc, tool, args, grant.authorization).then(value);
    const custom = {
      displayName: "User meeting point",
      latitude: 35.02,
      longitude: 135.75,
      coordinateSystem: "wgs84",
    };
    const saved = await call("idea_save_many", {
      idempotency_key: randomUUID(),
      ideas: [
        { name: "Manual meeting point", region: "Kyoto", location: { custom } },
        {
          name: "Reference to check",
          region: "Kyoto",
          location: { reference: { provider: providerId, providerPlaceId: "UNCHECKED" } },
        },
      ],
    });
    assert.equal(saved.created.length, 2);
    assert.equal(saved.created[0].location_status, "user_provided");
    assert.equal(saved.created[1].location_status, "needs_resolution");
    assert.deepEqual(saved.needs_completion, [
      { idea_id: saved.created[1].id, missing_fields: ["location"] },
    ]);
    await assert.rejects(
      call("idea_save_many", {
        idempotency_key: randomUUID(),
        ideas: [
          {
            name: "Forged Google snapshot",
            location: { custom: { ...custom, provider: "google" } },
          },
        ],
      }),
    );
    const trip = await freshTrip(call);
    const preview = await call("itinerary_apply_changes", {
      trip_id: trip.trip.id,
      expected_revision: trip.revision,
      dry_run: true,
      changes: [{ op: "add", day_id: trip.days[0].id, idea_id: saved.created[0].id }],
      idempotency_key: randomUUID(),
    });
    await call("itinerary_apply_changes", {
      trip_id: trip.trip.id,
      expected_revision: trip.revision,
      preview_id: preview.preview_id,
      idempotency_key: randomUUID(),
    });
    const item = (await call("trip_get", { trip_id: trip.trip.id, section: "items" })).items[0];
    assert.equal(item.place.provider, "custom");
    assert.equal(item.place.latitude, custom.latitude);
    const cleared = value(
      await invokeTool(webA, "idea_update", {
        idea_id: saved.created[0].id,
        expected_revision: saved.created[0].revision,
        patch: { location: null },
        idempotency_key: randomUUID(),
      }),
    );
    assert.equal(cleared.location_ref, null);
    await call("change_undo", { change_id: cleared.change_id, idempotency_key: randomUUID() });
    const restored = (await call("idea_search", { query: "Manual meeting point" })).items[0];
    assert.equal(restored.location_ref.latitude, custom.latitude);
    assert.ok(Number(restored.revision) > Number(cleared.revision));
    assert.equal(
      (await call("trip_get", { trip_id: trip.trip.id, section: "items" })).items[0].place_id,
      item.place_id,
    );
  });

  test("Maps lookup quotas apply to concurrent retries and aggregate across client connections", async () => {
    await resetUsage();
    const first = await issue(A, scopes),
      second = await issue(A, scopes);
    const { provider, calls } = fixture();
    const runner = createPlacesToolRunner(rpc, provider, {
      minute: 2,
      daily: 100,
      globalDaily: 1000,
    });
    const requests = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        invokeTool(
          rpc,
          "place_search",
          { query: "Kyoto" },
          [first, second][index % 2].authorization,
          runner,
        ),
      ),
    );
    assert.equal(requests.filter((result) => result.status === "fulfilled").length, 2);
    for (const result of requests)
      if (result.status === "rejected") assert.match(String(result.reason), /PLACE_RATE_LIMITED/);
    assert.equal(calls.length, 2);
    await resetUsage();
    const daily = createPlacesToolRunner(rpc, provider, {
      minute: 30,
      daily: 2,
      globalDaily: 1000,
    });
    await invokeTool(rpc, "place_search", { query: "Kyoto" }, first.authorization, daily);
    await invokeTool(rpc, "place_search", { query: "Kyoto" }, second.authorization, daily);
    await assert.rejects(
      invokeTool(rpc, "place_search", { query: "Kyoto" }, second.authorization, daily),
      /PLACE_QUOTA_EXCEEDED/,
    );
    await resetUsage();
    const global = createPlacesToolRunner(rpc, provider, { minute: 30, daily: 10, globalDaily: 1 });
    await invokeTool(rpc, "place_search", { query: "Kyoto" }, first.authorization, global);
    const b = await issue(B, scopes);
    await assert.rejects(
      invokeTool(rpc, "place_search", { query: "Kyoto" }, b.authorization, global),
      /PLACE_QUOTA_EXCEEDED/,
    );
  });

  test(
    "Maps real provider lookup writes a web-visible place without a model API key",
    {
      skip: process.env.MCP_PLACES_LIVE !== "1",
    },
    async () => {
      await resetUsage();
      const key =
        providerId === "google"
          ? process.env.GOOGLE_PLACES_API_KEY
          : process.env.AMAP_WEB_SERVICE_KEY;
      assert.ok(key, `${providerId} server Places key is required for real-provider verification`);
      const grant = await issue(A, scopes);
      const runner = createPlacesToolRunner(
        rpc,
        createLookupProvider(providerId, key, originalFetch),
        limits,
      );
      const call = (tool: string, args: unknown) =>
        invokeTool(rpc, tool, args, grant.authorization, runner).then(value);
      const search = await call("place_search", {
        query: providerId === "google" ? "Kiyomizu dera Kyoto Japan" : "北京 天坛公园",
        limit: 1,
      });
      assert.equal(search.candidates.length, 1);
      const selected = await call("place_resolve", {
        search_id: search.search_id,
        provider_place_id: search.candidates[0].provider_place_id,
      });
      assert.ok(
        Number.isFinite(selected.place.latitude) && Number.isFinite(selected.place.longitude),
      );
      const trip = await freshTrip(call);
      const base = { trip_id: trip.trip.id, expected_revision: trip.revision };
      const preview = await call("itinerary_apply_changes", {
        ...base,
        dry_run: true,
        changes: [
          {
            op: "add",
            day_id: trip.days[0].id,
            fields: {
              title: "Controlled real Maps verification",
              location: { selection_id: selected.selection_id },
            },
          },
        ],
        idempotency_key: randomUUID(),
      });
      await call("itinerary_apply_changes", {
        ...base,
        preview_id: preview.preview_id,
        idempotency_key: randomUUID(),
      });
      const web = value(
        await invokeTool(webA, "trip_get", { trip_id: trip.trip.id, section: "items" }),
      );
      assert.equal(web.items[0].place.providerPlaceId, selected.place.providerPlaceId);
      assert.equal(web.items[0].place.latitude, selected.place.latitude);
      assert.equal(JSON.stringify({ search, selected, web }).includes(key), false);
    },
  );
}
