/* eslint-disable @typescript-eslint/no-explicit-any -- Heterogeneous JSON results are inspected only by these integration assertions. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import OAuth2Server from "@node-oauth/oauth2-server";
import { credentialHash, oauthModel } from "./oauth-model";
import { registerClient } from "./oauth-registration";
import { invokeTool, type Rpc } from "./service";
import { handleMcp } from "./mcp";

const pool = new pg.Pool({ connectionString: process.env.MCP_TEST_DATABASE_URL });
const originalFetch = globalThis.fetch;
let outboundRequests = 0;
const config = {
  origin: "https://trip.example.test",
  issuer: "https://trip.example.test",
  resource: "https://trip.example.test/mcp",
  rateLimit: 600,
};
const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002";
const scopes = ["trips:read", "trips:write", "ideas:read", "ideas:write"];
function rpcAs(role = "service_role", actor?: string): Rpc {
  return async (name, args) => {
    assert.match(
      name,
      /^(ai_[a-z_]+_v1|save_itinerary_item_v3|remove_trip_collaborator|update_trip_status)$/,
    );
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query(`SET LOCAL ROLE ${role}`);
      await connection.query(
        "SELECT set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",
        [JSON.stringify({ sub: actor }), actor ?? ""],
      );
      const keys = Object.keys(args);
      keys.forEach((key) => assert.match(key, /^[a-z_]+$/));
      const query = `SELECT public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(",")}) AS data`;
      const values = keys.map((key) =>
        typeof args[key] === "object" && args[key] !== null ? JSON.stringify(args[key]) : args[key],
      );
      const result = await connection.query(query, values);
      await connection.query("COMMIT");
      return { data: result.rows[0].data, error: null };
    } catch (error) {
      await connection.query("ROLLBACK");
      const cause = error as { code: string; message: string };
      if (!["42501", "22023", "PT409", "40001"].includes(cause.code))
        console.error("Database diagnostic:", cause.code, cause.message);
      return { data: null, error: { code: cause.code, message: cause.message } };
    } finally {
      connection.release();
    }
  };
}
const rpc = rpcAs(),
  webA = rpcAs("authenticated", A),
  webB = rpcAs("authenticated", B);
const oauth = oauthModel(rpc, config);
type Authorization = { hash: string; resource: string; issuer: string };
let clientId: string;
let authorized: Authorization;
let access: string;
let refresh: string;
let tripId: string;
let ideaId: string;
let days: Array<{ id: string; variant_id: string; day_number: number; date: string }>;
const value = (input: unknown) => input as Record<string, any>; // Test assertions inspect heterogeneous tool results.
const invoke = async (tool: string, args: unknown, grant = authorized) =>
  value(await invokeTool(rpc, tool, args, grant));
async function issue(
  actor = A,
  allowedScopes = scopes,
  tripIds: string[] = [],
  allTrips = true,
  currentClient = clientId,
  wrongVerifier?: string,
) {
  const verifier = randomBytes(32).toString("base64url");
  const response = new OAuth2Server.Response();
  await oauth.server.authorize(
    new OAuth2Server.Request({
      method: "GET",
      headers: {},
      body: {},
      query: {
        client_id: currentClient,
        redirect_uri: "https://client.example.test/callback",
        response_type: "code",
        state: randomUUID(),
        scope: allowedScopes.join(" "),
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
      },
    }),
    response,
    {
      requirePKCE: true,
      authenticateHandler: {
        handle: async () => ({
          id: actor,
          trip_ids: tripIds,
          all_trips: allTrips,
          approved_scopes: allowedScopes,
        }),
      },
    },
  );
  const code = new URL(String(response.headers?.location)).searchParams.get("code")!;
  const token = await exchange({
    grant_type: "authorization_code",
    client_id: currentClient,
    redirect_uri: "https://client.example.test/callback",
    code,
    code_verifier: wrongVerifier ?? verifier,
  });
  return {
    token,
    authorization: {
      hash: credentialHash(token.accessToken),
      resource: config.resource,
      issuer: config.issuer,
    },
    code,
    verifier,
  };
}
async function exchange(body: Record<string, string>) {
  return oauth.server.token(
    new OAuth2Server.Request({
      method: "POST",
      query: {},
      body,
      headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "1" },
    }),
    new OAuth2Server.Response(),
    {
      requirePKCE: true,
      requireClientAuthentication: { authorization_code: false, refresh_token: false },
    },
  );
}
before(async () => {
  globalThis.fetch = async () => {
    outboundRequests++;
    throw new Error("Unexpected outbound HTTP request from business services");
  };
  await pool.query(
    "INSERT INTO auth.users(id,email) VALUES($1,'mcp-a@example.test'),($2,'mcp-b@example.test')",
    [A, B],
  );
  const registered = await registerClient(oauth, {
    client_name: "MCP integration client",
    redirect_uris: ["https://client.example.test/callback"],
  });
  clientId = registered.client_id;
  const issued = await issue();
  authorized = issued.authorization;
  access = issued.token.accessToken;
  refresh = issued.token.refreshToken!;
});
after(async () => {
  globalThis.fetch = originalFetch;
  await pool.end();
});

test("OAuth missing rows and consumed requests stay absent with the observed CloudBase SQL NULL transport shape", async () => {
  const cloudbaseNullRpc: Rpc = async (name, args) => {
    const result = await rpc(name, args);
    return { ...result, data: result.data === null ? {} : result.data };
  };
  const transported = oauthModel(cloudbaseNullRpc, config);
  assert.equal(await transported.model.getClient("missing-client", undefined), false);
  assert.equal(await transported.model.getAuthorizationCode("missing-code"), false);
  assert.equal(await transported.model.getAccessToken!("missing-access"), false);
  assert.equal(await transported.model.getRefreshToken!("missing-refresh"), false);
  const hash = credentialHash(randomUUID());
  const parameters = { client_id: clientId, state: randomUUID() };
  assert.equal(await transported.store("request_save", { hash, parameters }), true);
  assert.deepEqual(await transported.store("request_get", { hash }), parameters);
  assert.deepEqual(await transported.store("request_consume", { hash }), parameters);
  assert.equal(await transported.store("request_consume", { hash }), null);
  assert.equal(await transported.store("request_get", { hash }), null);
});
test("unauthenticated, forged, wrong issuer/resource, expired and read-only credentials are rejected", async () => {
  await assert.rejects(
    invokeTool(
      rpc,
      "trip_list",
      {},
      { ...authorized, hash: credentialHash("forged.jwt.signature") },
    ),
    /INVALID_TOKEN/,
  );
  await assert.rejects(
    invokeTool(rpc, "trip_list", {}, { ...authorized, issuer: "https://evil.test" }),
    /INVALID_TOKEN/,
  );
  await assert.rejects(
    invokeTool(rpc, "trip_list", {}, { ...authorized, resource: "https://evil.test/mcp" }),
    /INVALID_TOKEN/,
  );
  await assert.rejects(invokeTool(rpcAs("anon"), "trip_list", {}), /RESOURCE_FORBIDDEN/);
  const read = await issue(A, ["trips:read", "ideas:read"]);
  await assert.rejects(
    invoke(
      "trip_create",
      { title: "Denied", timezone: "Asia/Shanghai", idempotency_key: randomUUID() },
      read.authorization,
    ),
    /INSUFFICIENT_SCOPE/,
  );
  await pool.query(
    "UPDATE app_private.ai_credentials SET expires_at=now()-interval '1 second' WHERE hash=$1",
    [read.authorization.hash],
  );
  await assert.rejects(invoke("trip_list", {}, read.authorization), /INVALID_TOKEN/);
});
test("Idea batch deduplicates, preserves provenance/notes, saves missing region, serial and concurrent retries are atomic", async () => {
  await invoke("idea_save_many", {
    idempotency_key: randomUUID(),
    ideas: [{ name: "Existing museum", source_url: "https://places.test/museum" }],
  });
  const args = {
    idempotency_key: randomUUID(),
    ideas: [
      {
        name: "Duplicate",
        source_url: "https://places.test/museum?utm_source=chat#section",
        notes: "Do not overwrite",
      },
      {
        name: "Garden",
        region: "Kyoto",
        stable_place_id: "google:garden",
        notes: "User's notes",
        source_kind: "screenshot",
      },
      { name: "Noodle shop", source_url: "https://places.test/noodles", notes: "No region yet" },
      { name: "Market", region: "Kyoto", reason: "Morning visit" },
    ],
  };
  const initialConcurrent = await Promise.all(
    Array.from({ length: 5 }, () => invoke("idea_save_many", args)),
  );
  const batch = initialConcurrent[0];
  initialConcurrent.forEach((result) => assert.deepEqual(result, batch));
  assert.equal(batch.created.length, 3);
  assert.equal(batch.duplicates.length, 1);
  assert.equal(batch.needs_completion.length, 1);
  assert.equal(batch.failed.length, 0);
  ideaId = batch.created[0].id;
  assert.equal(batch.created[0].notes, "User's notes");
  assert.equal(batch.created[0].verification_status, "unverified");
  assert.deepEqual(await invoke("idea_save_many", args), batch);
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () => invoke("idea_save_many", args)),
  );
  concurrent.forEach((result) => assert.deepEqual(result, batch));
  await assert.rejects(
    invoke("idea_save_many", { ...args, ideas: [{ name: "Different" }] }),
    /IDEMPOTENCY_MISMATCH/,
  );
  const web = value(await invokeTool(webA, "idea_search", {}));
  assert.equal(web.items.length, 4);
  assert.equal(web.items.find((item: any) => item.id === ideaId).source_kind, "screenshot");
  const b = value(await invokeTool(webB, "idea_search", {}));
  assert.equal(b.items.length, 0);
  await assert.rejects(
    invokeTool(webB, "idea_update", {
      idea_id: ideaId,
      expected_revision: "1",
      patch: { name: "Stolen" },
      idempotency_key: randomUUID(),
    }),
    /RESOURCE_FORBIDDEN/,
  );
});
test("Trip creation is visible through web services; B IDs and resource ranges are isolated", async () => {
  const created = await invoke("trip_create", {
    title: "Kyoto",
    timezone: "Asia/Tokyo",
    start_date: "2026-12-01",
    end_date: "2026-12-03",
    day_count: 3,
    idempotency_key: randomUUID(),
  });
  tripId = created.trip.id;
  const web = value(await invokeTool(webA, "trip_get", { trip_id: tripId, section: "days" }));
  days = web.days.toSorted(
    (left: { day_number: number }, right: { day_number: number }) =>
      left.day_number - right.day_number,
  );
  assert.equal(web.trip.timezone, "Asia/Tokyo");
  assert.equal(web.trip.start_date, "2026-12-01");
  assert.equal(days[0].date, "2026-12-01");
  const b = value(
    await invokeTool(webB, "trip_create", {
      title: "Private B",
      timezone: "Asia/Shanghai",
      idempotency_key: randomUUID(),
    }),
  );
  await assert.rejects(invoke("trip_get", { trip_id: b.trip.id }), /RESOURCE_FORBIDDEN/);
  await assert.rejects(
    invoke("trip_update", {
      trip_id: b.trip.id,
      expected_revision: b.revision,
      patch: { title: "No" },
      idempotency_key: randomUUID(),
    }),
    /RESOURCE_FORBIDDEN/,
  );
  const limited = await issue(A, scopes, [], false);
  assert.equal((await invoke("trip_list", {}, limited.authorization)).items.length, 0);
  await assert.rejects(
    invoke("trip_get", { trip_id: tripId }, limited.authorization),
    /RESOURCE_FORBIDDEN/,
  );
});
test("Changing a referenced Idea after preview invalidates commit without changing the trip", async () => {
  const idea = (
    await invoke("idea_save_many", {
      ideas: [{ name: "Preview source", notes: "Before preview" }],
      idempotency_key: randomUUID(),
    })
  ).created[0];
  const trip = await invoke("trip_create", {
    title: "Idea preview revision test",
    timezone: "Asia/Tokyo",
    day_count: 1,
    idempotency_key: randomUUID(),
  });
  const day = (await invoke("trip_get", { trip_id: trip.trip.id, section: "days" })).days[0];
  const args = {
    trip_id: trip.trip.id,
    expected_revision: trip.revision,
    dry_run: true,
    changes: [{ op: "add", day_id: day.id, idea_id: idea.id }],
  };
  const preview = await invoke("itinerary_apply_changes", {
    ...args,
    idempotency_key: randomUUID(),
  });
  await invokeTool(webA, "idea_update", {
    idea_id: idea.id,
    expected_revision: idea.revision,
    patch: { notes: "Edited on the web after preview" },
    idempotency_key: randomUUID(),
  });
  await assert.rejects(
    invoke("itinerary_apply_changes", {
      trip_id: trip.trip.id,
      expected_revision: trip.revision,
      preview_id: preview.preview_id,
      idempotency_key: randomUUID(),
    }),
    /PREVIEW_INVALID/,
  );
  assert.equal(
    (await invoke("trip_get", { trip_id: trip.trip.id, section: "items" })).items.length,
    0,
  );
  const fresh = await invoke("itinerary_apply_changes", { ...args, idempotency_key: randomUUID() });
  await invoke("itinerary_apply_changes", {
    trip_id: trip.trip.id,
    expected_revision: trip.revision,
    preview_id: fresh.preview_id,
    idempotency_key: randomUUID(),
  });
  const saved = await invoke("trip_get", { trip_id: trip.trip.id, section: "items" });
  assert.equal(saved.items[0].notes, "Edited on the web after preview");
});
test("Preview/apply is transactional, Idea references are independent, moves, stale web revisions, undo, archive and restore", async () => {
  const trip = await invoke("trip_get", { trip_id: tripId });
  const changes = [
    { op: "add", day_id: days[0].id, idea_id: ideaId },
    { op: "add", day_id: days[0].id, fields: { title: "Lunch", type: "meal" } },
  ];
  const preview = await invoke("itinerary_apply_changes", {
    trip_id: tripId,
    expected_revision: trip.revision,
    dry_run: true,
    changes,
    idempotency_key: randomUUID(),
  });
  assert.equal((await invoke("trip_get", { trip_id: tripId, section: "items" })).items.length, 0);
  const submitted = {
    trip_id: tripId,
    expected_revision: trip.revision,
    preview_id: preview.preview_id,
    idempotency_key: randomUUID(),
  };
  const result = await invoke("itinerary_apply_changes", submitted);
  assert.deepEqual(await invoke("itinerary_apply_changes", submitted), result);
  const saved = await invoke("trip_get", { trip_id: tripId, section: "items" });
  assert.equal(saved.items.length, 2);
  assert.equal(saved.items.filter((item: any) => item.saved_idea_id === ideaId).length, 1);
  const moves = saved.items.map((item: any) => ({
    op: "move",
    item_id: item.id,
    day_id: days[1].id,
  }));
  const movePreview = await invoke("itinerary_apply_changes", {
    trip_id: tripId,
    expected_revision: saved.revision,
    dry_run: true,
    changes: moves,
    idempotency_key: randomUUID(),
  });
  const moved = await invoke("itinerary_apply_changes", {
    trip_id: tripId,
    expected_revision: saved.revision,
    preview_id: movePreview.preview_id,
    idempotency_key: randomUUID(),
  });
  assert.ok(
    (await invoke("trip_get", { trip_id: tripId, section: "items" })).items.every(
      (item: any) => item.day_id === days[1].id,
    ),
  );
  await invoke("change_undo", { change_id: moved.change_id, idempotency_key: randomUUID() });
  const restored = await invoke("trip_get", { trip_id: tripId, section: "items" });
  assert.ok(restored.items.every((item: any) => item.day_id === days[0].id));
  await assert.rejects(
    invoke("change_undo", { change_id: result.change_id, idempotency_key: randomUUID() }),
    /UNDO_CONFLICT/,
  );
  const bad = [
    { op: "add", day_id: days[0].id, fields: { title: "Must roll back" } },
    { op: "move", item_id: randomUUID(), day_id: days[1].id },
  ];
  await assert.rejects(
    invoke("itinerary_apply_changes", {
      trip_id: tripId,
      expected_revision: restored.revision,
      dry_run: true,
      changes: bad,
      idempotency_key: randomUUID(),
    }),
  );
  assert.equal((await invoke("trip_get", { trip_id: tripId, section: "items" })).items.length, 2);
  const stale = await invoke("itinerary_apply_changes", {
    trip_id: tripId,
    expected_revision: restored.revision,
    dry_run: true,
    changes: moves,
    idempotency_key: randomUUID(),
  });
  const edited = value(
    await invokeTool(webA, "trip_update", {
      trip_id: tripId,
      expected_revision: restored.revision,
      patch: { title: "Web edited" },
      idempotency_key: randomUUID(),
    }),
  );
  await assert.rejects(
    invoke("trip_update", {
      trip_id: tripId,
      expected_revision: restored.revision,
      patch: { title: "Overwrite" },
      idempotency_key: randomUUID(),
    }),
    /REVISION_CONFLICT/,
  );
  await assert.rejects(
    invoke("itinerary_apply_changes", {
      trip_id: tripId,
      expected_revision: edited.revision,
      preview_id: stale.preview_id,
      idempotency_key: randomUUID(),
    }),
    /PREVIEW_INVALID/,
  );
  const archived = await invoke("trip_archive", {
    trip_id: tripId,
    expected_revision: edited.revision,
    idempotency_key: randomUUID(),
  });
  const active = await invoke("trip_update", {
    trip_id: tripId,
    expected_revision: archived.revision,
    patch: { archived: false },
    idempotency_key: randomUUID(),
  });
  assert.equal(active.trip.status, "open");
  assert.equal((await invoke("trip_get", { trip_id: tripId, section: "items" })).items.length, 2);
});
test("Removal undo keeps identity and monotonic revisions, independent ideas work across trips", async () => {
  const initial = await invoke("trip_get", { trip_id: tripId, section: "items" });
  const item = initial.items[0];
  const preview = await invoke("itinerary_apply_changes", {
    trip_id: tripId,
    expected_revision: initial.revision,
    dry_run: true,
    changes: [{ op: "remove", item_id: item.id }],
    idempotency_key: randomUUID(),
  });
  const another = await issue();
  await assert.rejects(
    invoke(
      "itinerary_apply_changes",
      {
        trip_id: tripId,
        expected_revision: initial.revision,
        preview_id: preview.preview_id,
        idempotency_key: randomUUID(),
      },
      another.authorization,
    ),
    /PREVIEW_INVALID/,
  );
  const removed = await invoke("itinerary_apply_changes", {
    trip_id: tripId,
    expected_revision: initial.revision,
    preview_id: preview.preview_id,
    idempotency_key: randomUUID(),
  });
  assert.equal((await invoke("trip_get", { trip_id: tripId, section: "items" })).items.length, 1);
  await invoke("change_undo", { change_id: removed.change_id, idempotency_key: randomUUID() });
  const restored = (await invoke("trip_get", { trip_id: tripId, section: "items" })).items.find(
    (entry: any) => entry.id === item.id,
  );
  assert.equal(restored.title, item.title);
  assert.ok(restored.version > item.version);
  const second = await invoke("trip_create", {
    title: "Second trip",
    timezone: "America/Los_Angeles",
    idempotency_key: randomUUID(),
  });
  const secondDays = await invoke("trip_get", { trip_id: second.trip.id, section: "days" });
  const add = await invoke("itinerary_apply_changes", {
    trip_id: second.trip.id,
    expected_revision: secondDays.revision,
    dry_run: true,
    changes: [{ op: "add", day_id: secondDays.days[0].id, idea_id: ideaId }],
    idempotency_key: randomUUID(),
  });
  await invoke("itinerary_apply_changes", {
    trip_id: second.trip.id,
    expected_revision: secondDays.revision,
    preview_id: add.preview_id,
    idempotency_key: randomUUID(),
  });
  const linked = await invoke("trip_get", { trip_id: second.trip.id, section: "items" });
  assert.equal(linked.items[0].saved_idea_id, ideaId);
  const idea = (await invoke("idea_search", {})).items.find((entry: any) => entry.id === ideaId);
  const archived = await invoke("idea_archive", {
    idea_id: ideaId,
    expected_revision: String(idea.revision),
    idempotency_key: randomUUID(),
  });
  const updated = await invoke("idea_update", {
    idea_id: ideaId,
    expected_revision: String(archived.revision),
    patch: { archived: false, notes: "Updated personal note" },
    idempotency_key: randomUUID(),
  });
  assert.equal(updated.archived, false);
  assert.equal(
    (await invoke("trip_get", { trip_id: second.trip.id, section: "items" })).items[0].notes,
    "User's notes",
  );
  await assert.rejects(
    invoke("idea_update", {
      idea_id: ideaId,
      expected_revision: String(idea.revision),
      patch: { notes: "Stale" },
      idempotency_key: randomUUID(),
    }),
    /REVISION_CONFLICT/,
  );
});
test("OAuth rotation, independent revocation, PKCE and denial do not issue usable credentials", async () => {
  const activeBefore = Number(
    (
      await pool.query(
        "SELECT count(*) FROM app_private.ai_connections WHERE activated_at IS NOT NULL AND revoked_at IS NULL",
      )
    ).rows[0].count,
  );
  await assert.rejects(issue(A, scopes, [], true, clientId, "x".repeat(43)));
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM app_private.ai_connections WHERE activated_at IS NOT NULL AND revoked_at IS NULL",
        )
      ).rows[0].count,
    ),
    activeBefore,
  );
  const rotated = await exchange({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refresh,
  });
  await assert.rejects(
    exchange({ grant_type: "refresh_token", client_id: clientId, refresh_token: refresh }),
  );
  const other = await issue();
  const userGrant = value(await oauth.model.getAccessToken(access));
  const revoked = await webA("ai_connections_v1", {
    action: "revoke",
    connection_id: userGrant.user.connection_id,
  });
  assert.equal(revoked.error, null);
  await assert.rejects(invoke("trip_list", {}), /INVALID_TOKEN/);
  await assert.rejects(
    exchange({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: rotated.refreshToken!,
    }),
  );
  assert.ok((await invoke("trip_list", {}, other.authorization)).items.length > 0);
  const issued = await issue();
  await assert.rejects(
    exchange({
      grant_type: "authorization_code",
      client_id: clientId,
      code: issued.code,
      code_verifier: issued.verifier,
      redirect_uri: "https://client.example.test/callback",
    }),
  );
  const response = new OAuth2Server.Response();
  const count = Number(
    (await pool.query("SELECT count(*) FROM app_private.ai_connections")).rows[0].count,
  );
  await assert.rejects(
    oauth.server.authorize(
      new OAuth2Server.Request({
        method: "POST",
        headers: {},
        body: { allowed: "false" },
        query: {
          client_id: clientId,
          redirect_uri: "https://client.example.test/callback",
          response_type: "code",
          state: "denied",
        },
      }),
      response,
      { authenticateHandler: { handle: async () => ({ id: A }) }, requirePKCE: true },
    ),
  );
  assert.equal(
    Number((await pool.query("SELECT count(*) FROM app_private.ai_connections")).rows[0].count),
    count,
  );
  access = other.token.accessToken;
  authorized = other.authorization;
});
test("Live collaboration revocation and per-client isolation are rechecked before receipt replay", async () => {
  const otherClient = await registerClient(oauth, {
    client_name: "Independent second client",
    redirect_uris: ["https://client.example.test/callback"],
  });
  const independent = await issue(A, scopes, [], true, otherClient.client_id);
  const target = value(
    await invokeTool(webB, "trip_create", {
      title: "Shared",
      timezone: "Asia/Shanghai",
      idempotency_key: randomUUID(),
    }),
  );
  await pool.query(
    "INSERT INTO public.trip_members(trip_id,user_id,role) VALUES($1,$2,'collaborator')",
    [target.trip.id, A],
  );
  const collab = await issue(A, scopes, [target.trip.id], false);
  const before = await invoke("trip_get", { trip_id: target.trip.id }, collab.authorization);
  const args = {
    trip_id: target.trip.id,
    expected_revision: before.revision,
    patch: { title: "Collaborator saved" },
    idempotency_key: randomUUID(),
  };
  await invoke("trip_update", args, collab.authorization);
  const member = (
    await pool.query("SELECT id FROM public.trip_members WHERE trip_id=$1 AND user_id=$2", [
      target.trip.id,
      A,
    ])
  ).rows[0].id;
  const removed = await webB("remove_trip_collaborator", {
    target_trip_id: target.trip.id,
    target_member_id: member,
    target_operation_id: randomUUID(),
  });
  assert.equal(removed.error, null);
  await assert.rejects(
    invoke("trip_get", { trip_id: target.trip.id }, collab.authorization),
    /RESOURCE_FORBIDDEN/,
  );
  await assert.rejects(invoke("trip_update", args, collab.authorization), /RESOURCE_FORBIDDEN/);
  const token = value(await oauth.model.getAccessToken(access));
  await webA("ai_connections_v1", { action: "revoke", connection_id: token.user.connection_id });
  await assert.rejects(invoke("trip_list", {}), /INVALID_TOKEN/);
  assert.ok((await invoke("trip_list", {}, independent.authorization)).items.length > 0);
  authorized = independent.authorization;
  access = independent.token.accessToken;
});
test("Real MCP transport initializes and calls tools, rejects missing auth, enforces body/batch/rate limits", async () => {
  const request = (body: unknown, token = access) =>
    new Request(config.resource, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  const denied = await handleMcp(
    request({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ""),
    rpc,
    config,
  );
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("www-authenticate")!, /resource_metadata/);
  const initialized = await handleMcp(
    request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "integration", version: "1" },
      },
    }),
    rpc,
    config,
  );
  assert.equal(initialized.status, 200);
  const init = value(await initialized.json());
  assert.equal(init.result.serverInfo.name, "trip-planner");
  assert.equal(init.result.capabilities.sampling, undefined);
  const listed = await handleMcp(
    request({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    rpc,
    config,
  );
  const tools = value(await listed.json()).result.tools as Array<{
    name: string;
    annotations: { readOnlyHint: boolean; destructiveHint: boolean };
  }>;
  assert.equal(tools.length, 12);
  for (const name of ["account_get", "trip_list", "trip_get", "idea_search"]) {
    assert.equal(tools.find((tool) => tool.name === name)?.annotations.readOnlyHint, true);
  }
  for (const name of ["trip_create", "idea_save_many"]) {
    assert.deepEqual(tools.find((tool) => tool.name === name)?.annotations, {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  }
  for (const name of [
    "trip_update",
    "trip_archive",
    "idea_update",
    "idea_archive",
    "itinerary_apply_changes",
    "change_undo",
  ]) {
    assert.equal(tools.find((tool) => tool.name === name)?.annotations.readOnlyHint, false);
    assert.equal(tools.find((tool) => tool.name === name)?.annotations.destructiveHint, true);
  }
  const called = await handleMcp(
    request({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "account_get", arguments: {} },
    }),
    rpc,
    config,
  );
  const accountResult = value(await called.json()).result.structuredContent;
  assert.equal(accountResult.user_id, A);
  assert.equal(accountResult.url, `${config.origin}/account/ai`);
  await assert.rejects(
    invoke("idea_save_many", {
      idempotency_key: randomUUID(),
      ideas: Array.from({ length: 51 }, () => ({ name: "Limit" })),
    }),
  );
  const huge = await handleMcp(request({ text: "x".repeat(140000) }), rpc, config);
  assert.equal(huge.status, 413);
  const limited = { ...config, rateLimit: 1 };
  await pool.query("DELETE FROM app_private.ai_rate_buckets");
  const first = await handleMcp(
    request({ jsonrpc: "2.0", id: 4, method: "tools/list" }),
    rpc,
    limited,
  );
  assert.equal(first.status, 200);
  const second = await handleMcp(
    request({ jsonrpc: "2.0", id: 5, method: "tools/list" }),
    rpc,
    limited,
  );
  assert.equal(second.status, 429);
  assert.equal(second.headers.get("retry-after"), "60");
  assert.equal(outboundRequests, 0, "No model inference or other outbound HTTP was requested");
});
