import assert from "node:assert/strict";
import test from "node:test";

import { invokeCloudBaseCleanupHttp } from "./invoke-cloudbase-cleanup-http.mjs";

const success = {
  assets: { deletedAssets: 0 },
  backlog: false,
  shareImages: { revokedImages: 0 },
  status: "ok",
};

test("cleanup HTTP invocation uses only the fixed CloudBase function endpoint", async () => {
  let request;
  await invokeCloudBaseCleanupHttp({
    apiKey: "test-private-key",
    envId: "trip-planner-cn-dev-d3bz94038b26",
    fetchImpl: async (url, init) => {
      request = { init, url };
      return new Response(JSON.stringify(success));
    },
  });
  assert.equal(
    request.url,
    "https://trip-planner-cn-dev-d3bz94038b26.api.tcloudbasegateway.com/v1/functions/trip-planner-cleanup",
  );
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.headers.Authorization, "Bearer test-private-key");
  assert.deepEqual(JSON.parse(request.init.body), { source: "phase5-verification" });
});

test("cleanup HTTP invocation rejects unfixed hosts and returns only bounded failure categories", async () => {
  await assert.rejects(
    () =>
      invokeCloudBaseCleanupHttp({
        apiKey: "private-value-that-must-not-leak",
        envId: "example.invalid/path",
      }),
    /valid environment ID/,
  );
  await assert.rejects(
    () =>
      invokeCloudBaseCleanupHttp({
        apiKey: "private-value-that-must-not-leak",
        envId: "trip-planner-cn-dev-d3bz94038b26",
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ code: "FUNCTIONS_EXCEED_AUTHORITY", message: "raw-private-detail" }),
            { status: 403 },
          ),
      }),
    (error) => {
      assert.match(error.message, /category=authorization/);
      assert.doesNotMatch(error.message, /private-value|raw-private-detail/);
      return true;
    },
  );
});

test("cleanup HTTP invocation rejects oversized or malformed successful responses", async () => {
  for (const response of [
    new Response("not-json"),
    new Response(JSON.stringify({ result: { status: "ok" } })),
    new Response("x", { headers: { "content-length": "65537" } }),
  ]) {
    await assert.rejects(() =>
      invokeCloudBaseCleanupHttp({
        apiKey: "test-private-key",
        envId: "trip-planner-cn-dev-d3bz94038b26",
        fetchImpl: async () => response,
      }),
    );
  }
});
