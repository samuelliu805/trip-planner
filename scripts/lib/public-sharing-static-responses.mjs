import assert from "node:assert/strict";

/** Complete local dev chunks before handing them to Chromium's intercepted script loader. */
export async function bufferDevelopmentScripts(page) {
  const metrics = [];
  await page.route("**/_next/static/**/*.js*", async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    const headers = response.headers();
    metrics.push({
      url: new URL(route.request().url()).pathname,
      status: response.status(),
      bytes: body.byteLength,
      length: headers["content-length"],
      encoding: headers["content-encoding"],
    });
    if (!headers["content-encoding"] && headers["content-length"])
      assert.equal(
        body.byteLength,
        Number(headers["content-length"]),
        "Complete dev script response",
      );
    delete headers["content-encoding"];
    delete headers["transfer-encoding"];
    headers["content-length"] = String(body.byteLength);
    await route.fulfill({ status: response.status(), headers, body });
  });
  return metrics;
}
