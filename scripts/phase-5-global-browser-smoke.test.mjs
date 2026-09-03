import assert from "node:assert/strict";
import test from "node:test";

import {
  clearBrowserSessionForPublicShare,
  parsePreviewCookies,
  previewProtectionHeaders,
  requireAuthorizedCleanup,
} from "./lib/phase-5-global-browser-smoke.mjs";

test("builds Vercel Preview protection headers without putting the secret in a URL", () => {
  assert.deepEqual(previewProtectionHeaders("  controlled-bypass  ", true), {
    "x-vercel-protection-bypass": "controlled-bypass",
    "x-vercel-set-bypass-cookie": "true",
  });
  assert.throws(() => previewProtectionHeaders(""), /VERCEL_AUTOMATION_BYPASS_SECRET/);
});

test("accepts only bounded cookie name/value pairs from the protected Preview response", () => {
  assert.deepEqual(
    parsePreviewCookies([
      "_vercel_jwt=opaque-value; Path=/; Secure; HttpOnly",
      "invalid cookie=value",
      "missing-value=",
      "control=bad\u0001value",
    ]),
    [{ name: "_vercel_jwt", value: "opaque-value" }],
  );
});

test("classifies cleanup authorization without exposing credential values", async () => {
  await assert.rejects(
    () =>
      requireAuthorizedCleanup(
        new Response("Unauthorized", {
          headers: { "content-type": "text/plain;charset=UTF-8" },
          status: 401,
        }),
      ),
    /CRON_SECRET must exactly match.*SUPABASE_DEV_CRON_SECRET/,
  );
  await assert.rejects(
    () =>
      requireAuthorizedCleanup(
        new Response("Authentication Required", {
          headers: { "content-type": "text/html" },
          status: 401,
        }),
      ),
    /VERCEL_AUTOMATION_BYPASS_SECRET/,
  );
});

test("restores the Vercel Preview bypass after clearing the authenticated browser session", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push({ kind: "fetch", options });
    return {
      headers: {
        getSetCookie: () => ["_vercel_jwt=opaque-bypass; Path=/; Secure; HttpOnly"],
      },
    };
  };
  const browser = {
    cdp: {
      async send(method, params, sessionId) {
        calls.push({ kind: "cdp", method, params, sessionId });
        return method === "Network.setCookie" ? { success: true } : {};
      },
    },
    sessionId: "phase5-session",
  };

  try {
    await clearBrowserSessionForPublicShare(
      browser,
      "https://preview.example.invalid",
      "controlled-bypass",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0].method, "Network.clearBrowserCookies");
  assert.deepEqual(calls[1].options.headers, {
    "x-vercel-protection-bypass": "controlled-bypass",
    "x-vercel-set-bypass-cookie": "true",
  });
  assert.deepEqual(calls[2], {
    kind: "cdp",
    method: "Network.setCookie",
    params: {
      name: "_vercel_jwt",
      url: "https://preview.example.invalid",
      value: "opaque-bypass",
    },
    sessionId: "phase5-session",
  });
});
