import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { bufferDevelopmentScripts } from "./lib/public-sharing-static-responses.mjs";

async function withTransport(responses, verify) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.headers);
    const next = responses[Math.min(requests.length - 1, responses.length - 1)];
    response.statusCode = next.status ?? 200;
    response.end(next.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const routes = new Map();
    const page = {
      route: async (pattern, handler) => routes.set(pattern, handler),
      goto: async () => ({ status: 200 }),
    };
    const metrics = await bufferDevelopmentScripts(page);
    const url = `http://127.0.0.1:${server.address().port}`;
    const invoke = async (path, type, pattern) => {
      let delivered;
      if (type === "document") return page.goto(url + path);
      await routes.get(pattern)({
        request: () => ({
          url: () => url + path,
          resourceType: () => type,
          headers: () => ({ "accept-encoding": "gzip", connection: "keep-alive" }),
        }),
        fulfill: async (result) => {
          delivered = result;
        },
        fallback: async () => {
          throw new Error("Unexpected fallback");
        },
      });
      return delivered;
    };
    await verify({ invoke, requests, metrics });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("only Next dev loadManifest races are retried before document delivery", async () => {
  await withTransport(
    [
      { status: 500, body: "Unexpected end of JSON input at loadManifest" },
      { body: "<html>Complete controlled page</html>" },
    ],
    async ({ invoke, requests, metrics }) => {
      const result = await invoke("/share/token", "document", "**/share/**");
      assert.equal(result.status, 200);
      assert.equal(requests.length, 2);
      assert.equal(metrics[0].devManifestRetry, 1);
      assert.ok(
        requests.every(
          (request) => request["accept-encoding"] === "identity" && request.connection === "close",
        ),
      );
    },
  );
});

test("application failures remain visible without manifest retries", async () => {
  await withTransport(
    [{ status: 500, body: "Application bug: invalid trip" }],
    async ({ invoke, requests, metrics }) => {
      await assert.rejects(invoke("/share/token", "document", "**/share/**"), /HTTP 500/);
      assert.equal(requests.length, 1);
      assert.equal(metrics.length, 0);
    },
  );
});

test("transient truncated scripts are never delivered to the browser", async () => {
  await withTransport(
    [{ body: "const title = 'incomplete" }, { body: "const title = 'complete';" }],
    async ({ invoke, requests }) => {
      const result = await invoke(
        "/_next/static/chunks/layout.js",
        "script",
        "**/_next/static/**/*.js*",
      );
      assert.equal(result.body.toString(), "const title = 'complete';");
      assert.equal(requests.length, 2);
    },
  );
});

test("persistent script syntax failures fail verification", async () => {
  await withTransport([{ body: "const title = 'incomplete" }], async ({ invoke, requests }) => {
    await assert.rejects(
      invoke("/_next/static/chunks/layout.js", "script", "**/_next/static/**/*.js*"),
      SyntaxError,
    );
    assert.equal(requests.length, 5);
  });
});
