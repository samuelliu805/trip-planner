import assert from "node:assert/strict";
import { Script } from "node:vm";

/** Complete local dev chunks before handing them to Chromium's intercepted script loader. */
export async function bufferDevelopmentScripts(page) {
  const metrics = [];
  await page.route("**/_next/static/**/*.js*", async (route) => {
    const url = new URL(route.request().url());
    assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
    let body, headers, status, failure;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        // Next's dev emitter can rewrite a chunk between stat and stream, returning
        // an empty Content-Length or a partial compressed body. Independent identity
        // connections and a syntax check keep those transient bytes out of Chromium.
        const response = await fetch(url, {
          headers: { "Accept-Encoding": "identity", Connection: "close" },
          signal: AbortSignal.timeout(15_000),
        });
        body = Buffer.from(await response.arrayBuffer());
        headers = Object.fromEntries(response.headers);
        status = response.status;
        if (status === 200) assert.ok(body.byteLength > 0, "Dev chunk must be nonempty");
        if (headers["content-length"])
          assert.equal(body.byteLength, Number(headers["content-length"]));
        if (status === 200) {
          if (url.pathname.endsWith(".js"))
            new Script(body.toString("utf8"), { filename: url.pathname });
          else JSON.parse(body.toString("utf8"));
        }
        failure = undefined;
        break;
      } catch (error) {
        failure = error;
        if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (failure) throw failure;
    metrics.push({
      url: url.pathname,
      status,
      bytes: body.byteLength,
      length: headers["content-length"],
      encoding: headers["content-encoding"],
    });
    delete headers["content-encoding"];
    delete headers["transfer-encoding"];
    headers["content-length"] = String(body.byteLength);
    await route.fulfill({ status, headers, body });
  });
  await bufferDevShareDocuments(page, metrics);
  return metrics;
}

async function bufferDevShareDocuments(page, metrics) {
  const navigate = page.goto.bind(page);
  page.goto = async (href, options) => {
    const url = new URL(href);
    if (["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/share/")) {
      for (let attempt = 0; attempt < 5; attempt++) {
        // Warm the on-demand route before native browser navigation. Leave Next's
        // document/RSC streaming and browser hydration completely untouched.
        const response = await fetch(url, {
          headers: { "Accept-Encoding": "identity", Connection: "close" },
          signal: AbortSignal.timeout(90_000),
        });
        const text = await response.text();
        const writingManifest =
          response.status === 500 &&
          text.includes("Unexpected end of JSON input") &&
          text.includes("loadManifest");
        if (writingManifest && attempt < 4) {
          metrics.push({ url: url.pathname, devManifestRetry: attempt + 1 });
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        assert.ok(response.status < 500, `Dev document failed: HTTP ${response.status}`);
        break;
      }
    }
    return navigate(href, options);
  };
}
