import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePreviewCookies,
  previewProtectionHeaders,
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
