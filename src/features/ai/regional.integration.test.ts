/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect heterogeneous tool JSON in integration assertions. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import pg from "pg";
import { generateKeyPair, exportJWK } from "jose";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { oauthModel, credentialHash } from "./oauth-model";
import { callRpc, type Rpc } from "./service";
import { createRegionalGateway, gatewayContext, type ToolRunner } from "./regional-gateway";
import { handleRegionalApi } from "./regional-endpoint";
import { regionalFetch, signRegional } from "./regional-auth";
import { handleMcp } from "./mcp";
import type { RegionalConfig } from "./regional-config";

const globalDb = new pg.Pool({ connectionString: process.env.MCP_TEST_GLOBAL_DATABASE_URL });
const cnDb = new pg.Pool({ connectionString: process.env.MCP_TEST_CN_DATABASE_URL });
const globalA = "20000000-0000-4000-8000-000000000001",
  globalB = "20000000-0000-4000-8000-000000000002";
const cnA = "regional-cn-A",
  cnB = "regional-cn-B";
const scopes = ["trips:read", "trips:write", "ideas:read", "ideas:write", "places:read"];
const config = {
  origin: "https://gateway.test",
  issuer: "https://gateway.test",
  resource: "https://gateway.test/mcp",
  rateLimit: 600,
};
function rpcAs(pool: pg.Pool, actor?: string): Rpc {
  return async (name, args) => {
    assert.match(name, /^ai_[a-z_]+_v1$/);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${actor ? "authenticated" : "service_role"}`);
      await client.query(
        "SELECT set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",
        [JSON.stringify({ sub: actor }), actor ?? ""],
      );
      const keys = Object.keys(args);
      keys.forEach((key) => assert.match(key, /^[a-z_]+$/));
      const { rows } = await client.query(
        `SELECT public.${name}(${keys.map((key, i) => `${key}=>$${i + 1}`).join(",")}) AS data`,
        keys.map((key) =>
          typeof args[key] === "object" && args[key] !== null
            ? JSON.stringify(args[key])
            : args[key],
        ),
      );
      await client.query("COMMIT");
      return { data: rows[0].data, error: null };
    } catch (error) {
      await client.query("ROLLBACK");
      const cause = error as { code: string; message: string; detail?: string };
      if (!["42501", "22023", "PT409"].includes(cause.code))
        console.error("Regional database diagnostic:", name, cause.code, cause.message);
      return {
        data: null,
        error: { code: cause.code, message: cause.message, details: cause.detail },
      };
    } finally {
      client.release();
    }
  };
}
const globalRpc = rpcAs(globalDb),
  cnRpc = rpcAs(cnDb),
  webA = rpcAs(globalDb, globalA);
const oauth = oauthModel(globalRpc, config);
async function issue(actor = globalA, granted = scopes, tripIds: string[] = [], allTrips = true) {
  const token = randomBytes(32).toString("base64url"),
    hash = credentialHash(token);
  const connection = (await oauth.store("code_save", {
    hash: credentialHash(randomUUID()),
    expires_at: new Date(Date.now() + 120000).toISOString(),
    user_key: actor,
    client_id: "regional-test",
    scopes: granted,
    trip_ids: tripIds,
    all_trips: allTrips,
    ...config,
    payload: {},
  })) as { connection_id: string };
  await oauth.store("tokens_save", {
    ...connection,
    credentials: [
      { kind: "access", hash, expires_at: new Date(Date.now() + 900000).toISOString() },
    ],
    payload: { scope: granted, accessTokenExpiresAt: new Date(Date.now() + 900000).toISOString() },
  });
  return {
    token,
    actor,
    authorization: { hash, issuer: config.issuer, resource: config.resource },
    connection_id: connection.connection_id,
  };
}
let globalConfig: RegionalConfig, cnConfig: RegionalConfig, runner: ToolRunner;
let unavailable = false,
  unrelatedNetworkRequests = 0;
const originalFetch = globalThis.fetch;
const servers: ReturnType<typeof createServer>[] = [];
let primary: Awaited<ReturnType<typeof issue>>;
const invoke = async (tool: string, input: unknown = {}, current = primary) =>
  (await runner(tool, input, current.authorization)) as any;
async function bind(
  current = primary,
  actor = cnA,
  granted = scopes,
  allTrips = true,
  tripIds: string[] = [],
) {
  const state = credentialHash(randomUUID()),
    code = credentialHash(randomUUID());
  await callRpc(rpcAs(globalDb, current.actor), "ai_gateway_manage_v1", {
    action: "start",
    input: { connection_id: current.connection_id, state_hash: state },
  });
  await callRpc(rpcAs(cnDb, actor), "ai_regional_grant_v1", {
    input: {
      connection_id: current.connection_id,
      state_hash: state,
      code_hash: code,
      scopes: granted,
      all_trips: allTrips,
      trip_ids: tripIds,
      issuer: config.issuer,
      resource: config.resource,
    },
  });
  const grant = await regionalFetch(globalConfig, "gateway", "cn", {
    action: "exchange",
    connection_id: current.connection_id,
    state_hash: state,
    code_hash: code,
  });
  await callRpc(globalRpc, "ai_gateway_service_v1", {
    action: "bind",
    input: { connection_id: current.connection_id, state_hash: state, grant },
  });
  return grant;
}
before(async () => {
  for (const [pool, actors] of [
    [globalDb, [globalA, globalB]],
    [cnDb, [cnA, cnB]],
  ] as const)
    for (const actor of actors)
      await pool.query("INSERT INTO auth.users(id,email) VALUES($1,'same-email@example.test')", [
        actor,
      ]);
  await oauth.store("client_save", {
    id: "regional-test",
    metadata: {
      client_name: "Regional acceptance",
      redirect_uris: ["https://client.test/callback"],
    },
  });
  const gatewayKeys = await generateKeyPair("ES256", { extractable: true });
  const cnKeys = await generateKeyPair("ES256", { extractable: true });
  const base = {
    gatewayOrigin: config.origin,
    cnOrigin: "https://cn.test",
    issuer: config.issuer,
    resource: config.resource,
    originFor: (region: string) => (region === "cn" ? "https://cn.test" : config.origin),
  };
  globalConfig = {
    ...base,
    privateJwk: JSON.stringify(await exportJWK(gatewayKeys.privateKey)),
    peerPublicJwk: JSON.stringify(await exportJWK(cnKeys.publicKey)),
  };
  cnConfig = {
    ...base,
    privateJwk: JSON.stringify(await exportJWK(cnKeys.privateKey)),
    peerPublicJwk: JSON.stringify(await exportJWK(gatewayKeys.publicKey)),
  };
  runner = createRegionalGateway(
    globalRpc,
    base.originFor,
    (tool, args, authorization, context, grant) =>
      regionalFetch(globalConfig, "gateway", "cn", {
        action: "invoke",
        tool,
        args,
        authorization,
        connection_id: context.connection_id,
        grant_id: grant.grant_id,
      }),
  );
  const origins = new Map<string, string>();
  for (const region of ["global", "cn"] as const) {
    const server = createServer(async (request, response) => {
      const buffers = [];
      for await (const chunk of request) buffers.push(chunk);
      const body = Buffer.concat(buffers),
        origin = region === "global" ? config.origin : base.cnOrigin;
      const input = new Request(`${origin}${request.url}`, {
        method: request.method,
        headers: request.headers as Record<string, string>,
        ...(body.length ? { body } : {}),
      });
      const result =
        request.url === "/mcp"
          ? await handleMcp(input, globalRpc, config, undefined, runner)
          : await handleRegionalApi(
              input,
              region === "global" ? globalRpc : cnRpc,
              region === "global" ? globalConfig : cnConfig,
              region,
            );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    servers.push(server);
    origins.set(
      region === "global" ? config.origin : base.cnOrigin,
      `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    );
  }
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input)),
      target = origins.get(url.origin);
    if (!target) {
      unrelatedNetworkRequests++;
      throw new Error("Unexpected network destination");
    }
    if (unavailable && url.origin === base.cnOrigin) throw new Error("Controlled regional outage");
    return originalFetch(
      new URL(url.pathname + url.search, target),
      init ??
        (input instanceof Request
          ? ({
              method: input.method,
              headers: input.headers,
              body: input.body,
              duplex: "half",
            } as RequestInit)
          : undefined),
    );
  };
  primary = await issue();
});
after(async () => {
  globalThis.fetch = originalFetch;
  for (const server of servers) await new Promise<void>((done) => server.close(() => done()));
  await Promise.all([globalDb.end(), cnDb.end()]);
});

test("one MCP configuration routes two real databases and enforces independent grants", async (t) => {
  const client = new Client({ name: "Regional integration SDK", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(config.resource), {
      requestInit: { headers: { Authorization: `Bearer ${primary.token}` } },
      fetch: globalThis.fetch,
    }),
  );
  let globalTrip: any, cnTrip: any, cnIdea: any;
  await t.test("legacy Global resources and unbound CN", async () => {
    globalTrip = await invoke("trip_create", {
      title: "[regional-e2e] Shanghai destination",
      timezone: "Asia/Shanghai",
      idempotency_key: randomUUID(),
    });
    assert.equal(globalTrip.data_region, "global");
    assert.match(globalTrip.trip.id, /^[0-9a-f-]{36}$/);
    await assert.rejects(invoke("trip_list", { region: "cn" }), /REGION_AUTHORIZATION_REQUIRED/);
    assert.equal((await gatewayContext(globalRpc, primary.authorization)).regions.length, 1);
    assert.equal(
      (await cnDb.query("SELECT count(*) FROM public.trips WHERE title LIKE '[regional-e2e]%'"))
        .rows[0].count,
      "0",
    );
  });
  await t.test(
    "browser-backed CN proof, single-use exchange and same client configuration",
    async () => {
      const grant = await bind();
      const result = (await client.callTool({ name: "account_get", arguments: {} })) as any;
      assert.deepEqual(
        result.structuredContent.bound_regions.sort(),
        ["cn", "global"],
        JSON.stringify(result.structuredContent),
      );
      assert.equal(grant.user_id, cnA);
      await assert.rejects(
        callRpc(rpcAs(globalDb, globalB), "ai_gateway_manage_v1", {
          action: "default",
          input: { connection_id: primary.connection_id, region: "cn" },
        }),
        /RESOURCE_FORBIDDEN/,
      );
      await callRpc(webA, "ai_gateway_manage_v1", {
        action: "default",
        input: { connection_id: primary.connection_id, region: "cn" },
      });
      const created = (await client.callTool({
        name: "trip_create",
        arguments: {
          title: "[regional-e2e] London destination",
          timezone: "Europe/London",
          idempotency_key: randomUUID(),
        },
      })) as any;
      assert.equal(created.isError, undefined, JSON.stringify(created));
      cnTrip = created.structuredContent;
      assert.match(cnTrip.trip.id, /^cn:/);
      assert.equal(
        (
          await globalDb.query(
            "SELECT count(*) FROM public.trips WHERE title='[regional-e2e] London destination'",
          )
        ).rows[0].count,
        "0",
      );
      await assert.rejects(
        invoke("trip_get", { trip_id: globalTrip.trip.id, region: "cn" }),
        /CROSS_REGION_OPERATION/,
      );
      assert.equal(
        (await invoke("trip_get", { trip_id: globalTrip.trip.id })).data_region,
        "global",
      );
    },
  );
  assert.ok(cnTrip, "CN binding and creation are prerequisites for subsequent checks");
  await t.test("parallel retries, request mismatch and scoped handles", async () => {
    const input = {
      idempotency_key: randomUUID(),
      ideas: [{ name: "[regional-e2e] museum", region: "London" }],
    };
    const results = await Promise.all([
      invoke("idea_save_many", input),
      invoke("idea_save_many", input),
    ]);
    assert.deepEqual(results[0], results[1]);
    cnIdea = results[0].created[0];
    assert.match(cnIdea.id, /^cn:/);
    await assert.rejects(
      invoke("idea_save_many", { ...input, ideas: [{ name: "Different" }] }),
      /IDEMPOTENCY_MISMATCH/,
    );
    assert.equal(
      (
        await invoke("idea_update", {
          idea_id: cnIdea.id,
          expected_revision: String(cnIdea.revision),
          idempotency_key: randomUUID(),
          patch: { notes: "independent" },
        })
      ).data_region,
      "cn",
    );
    const other = await issue(globalB);
    await assert.rejects(
      invoke("trip_get", { trip_id: globalTrip.trip.id }, other),
      /RESOURCE_FORBIDDEN/,
    );
    await assert.rejects(
      invoke("trip_get", { trip_id: cnTrip.trip.id }, other),
      /REGION_AUTHORIZATION_REQUIRED/,
    );
    // Same email never creates or changes the regional identity mapping.
    assert.equal((await gatewayContext(globalRpc, other.authorization)).regions.length, 1);
    await bind(other, cnB);
    await assert.rejects(
      invoke("trip_get", { trip_id: cnTrip.trip.id }, other),
      /RESOURCE_FORBIDDEN/,
    );
    await assert.rejects(
      invoke(
        "idea_update",
        {
          idea_id: cnIdea.id,
          expected_revision: "2",
          idempotency_key: randomUUID(),
          patch: { name: "Forbidden" },
        },
        other,
      ),
      /IDEA_FORBIDDEN|RESOURCE_FORBIDDEN/,
    );
  });
  await t.test("all composite references checked before any write", async () => {
    const read = await invoke("trip_get", { trip_id: cnTrip.trip.id, section: "days" });
    await assert.rejects(
      invoke("itinerary_apply_changes", {
        trip_id: cnTrip.trip.id,
        expected_revision: read.revision,
        idempotency_key: randomUUID(),
        dry_run: true,
        changes: [{ op: "add", day_id: globalTrip.trip.id, fields: { title: "Cross-region" } }],
      }),
      /CROSS_REGION_OPERATION/,
    );
    const input = {
      trip_id: cnTrip.trip.id,
      expected_revision: read.revision,
      dry_run: true,
      idempotency_key: randomUUID(),
      changes: [
        {
          op: "add",
          day_id: read.days[0].id,
          fields: { title: "CN meal", type: "meal", scheduleKind: "exact", startTime: "12:30" },
        },
      ],
    };
    const preview = await invoke("itinerary_apply_changes", input);
    assert.match(preview.preview_id, /^cn:/);
    assert.equal(
      (await invoke("trip_get", { trip_id: cnTrip.trip.id, section: "items" })).items.length,
      0,
    );
    await assert.rejects(
      invoke("itinerary_apply_changes", {
        trip_id: globalTrip.trip.id,
        expected_revision: globalTrip.revision,
        dry_run: false,
        preview_id: preview.preview_id,
        idempotency_key: randomUUID(),
      }),
      /CROSS_REGION_OPERATION/,
    );
    await invoke("itinerary_apply_changes", {
      trip_id: cnTrip.trip.id,
      expected_revision: read.revision,
      dry_run: false,
      preview_id: preview.preview_id,
      idempotency_key: randomUUID(),
    });
    assert.equal(
      (await invoke("trip_get", { trip_id: cnTrip.trip.id, section: "items" })).items[0].title,
      "CN meal",
    );
  });
  await t.test("stable aggregate pages and cursor isolation", async () => {
    const first = await invoke("trip_list", { limit: 1 });
    assert.equal(first.items.length, 1);
    assert.match(first.next_cursor, /^page:/);
    const ids = [first.items[0].id];
    let cursor = first.next_cursor;
    while (cursor) {
      const page = await invoke("trip_list", { limit: 1, cursor });
      ids.push(...page.items.map((item: any) => item.id));
      cursor = page.next_cursor;
    }
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes(globalTrip.trip.id));
    assert.ok(ids.includes(cnTrip.trip.id));
    await assert.rejects(
      invoke("trip_list", { limit: 1, cursor: first.next_cursor }, await issue()),
      /CURSOR_INVALID/,
    );
    await assert.rejects(
      invoke("trip_list", { limit: 2, cursor: first.next_cursor }),
      /CURSOR_INVALID/,
    );
  });
  await t.test("outage is explicit and writes never fail over", async () => {
    unavailable = true;
    await assert.rejects(
      invoke("trip_create", {
        title: "[regional-e2e] MUST NOT EXIST",
        timezone: "UTC",
        idempotency_key: randomUUID(),
      }),
      /REGION_UNAVAILABLE/,
    );
    const partial = await invoke("trip_list");
    assert.equal(partial.partial, true);
    assert.equal(partial.failures[0].region, "cn");
    assert.ok(partial.items.some((item: any) => item.id === globalTrip.trip.id));
    unavailable = false;
    assert.equal(
      (
        await globalDb.query(
          "SELECT count(*) FROM public.trips WHERE title='[regional-e2e] MUST NOT EXIST'",
        )
      ).rows[0].count,
      "0",
    );
  });
  await t.test("read-only and independent regional unbinding", async () => {
    const readOnly = await issue(globalA, ["trips:read", "ideas:read"]);
    await bind(readOnly, cnA, ["trips:read", "ideas:read"]);
    await assert.rejects(
      invoke(
        "trip_create",
        { region: "cn", title: "Forbidden", timezone: "UTC", idempotency_key: randomUUID() },
        readOnly,
      ),
      /INSUFFICIENT_SCOPE/,
    );
    await callRpc(webA, "ai_gateway_manage_v1", {
      action: "unbind",
      input: { connection_id: primary.connection_id, region: "cn" },
    });
    await assert.rejects(
      invoke("trip_get", { trip_id: cnTrip.trip.id }),
      /REGION_AUTHORIZATION_REQUIRED/,
    );
    await assert.rejects(
      invoke("trip_create", { title: "Ambiguous", timezone: "UTC", idempotency_key: randomUUID() }),
      /REGION_SELECTION_REQUIRED/,
    );
    assert.equal((await invoke("trip_get", { trip_id: globalTrip.trip.id })).data_region, "global");
    assert.equal(
      (await invoke("trip_get", { trip_id: cnTrip.trip.id }, readOnly)).data_region,
      "cn",
    );
    const restricted = await issue(globalA, scopes, [globalTrip.trip.id], false);
    await bind(restricted, cnA, scopes, false, [cnTrip.trip.id.slice(3)]);
    await assert.rejects(
      invoke(
        "trip_create",
        {
          region: "cn",
          title: "No all-trip grant",
          timezone: "UTC",
          idempotency_key: randomUUID(),
        },
        restricted,
      ),
      /ALL_TRIPS_GRANT_REQUIRED/,
    );
    const another = await invoke("trip_create", {
      region: "global",
      title: "[regional-e2e] Outside restricted grant",
      timezone: "UTC",
      idempotency_key: randomUUID(),
    });
    await assert.rejects(
      invoke("trip_get", { trip_id: another.trip.id }, restricted),
      /RESOURCE_FORBIDDEN/,
    );
  });
  await t.test("service-body tampering and total revocation before cached receipts", async () => {
    await assert.rejects(
      signRegional(
        { ...globalConfig, privateJwk: "private-key-must-not-appear-in-errors" },
        "gateway",
        "cn",
        "api",
        {},
      ),
      (error) =>
        error instanceof Error &&
        error.message === "REGIONAL_CONFIGURATION_REQUIRED" &&
        !error.stack?.includes("private-key-must-not-appear"),
    );
    await bind();
    const context = await gatewayContext(globalRpc, primary.authorization),
      grant = context.regions.find((r) => r.region === "cn")!;
    const body = {
      action: "invoke",
      tool: "account_get",
      args: {},
      connection_id: primary.connection_id,
      grant_id: grant.grant_id,
      authorization: primary.authorization,
    };
    const token = await signRegional(globalConfig, "gateway", "cn", "api", {
      digest: credentialHash(JSON.stringify(body)),
    });
    const validRequest = () =>
      globalThis.fetch("https://cn.test/api/ai/regional", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    assert.equal((await validRequest()).status, 200);
    const replayed = await validRequest();
    assert.equal(replayed.status, 401);
    assert.equal((await replayed.json()).error, "INVALID_SERVICE_IDENTITY");
    const changed = await globalThis.fetch("https://cn.test/api/ai/regional", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, tool: "trip_list" }),
    });
    assert.equal(changed.status, 401);
    const input = {
      region: "cn",
      title: "[regional-e2e] Revocation receipt",
      timezone: "UTC",
      idempotency_key: randomUUID(),
    };
    await invoke("trip_create", input);
    await callRpc(webA, "ai_connections_v1", {
      action: "revoke",
      connection_id: primary.connection_id,
    });
    await assert.rejects(invoke("trip_create", input), /INVALID_TOKEN/);
    await assert.rejects(regionalFetch(globalConfig, "gateway", "cn", body), /INVALID_TOKEN/);
    assert.equal(unrelatedNetworkRequests, 0, "No model or sampling requests");
  });
  await client.close();
});
