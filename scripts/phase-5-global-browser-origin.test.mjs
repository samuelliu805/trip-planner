import assert from "node:assert/strict";
import test from "node:test";

import {
  approvedGoogleBrowserHostname,
  resolveGlobalBrowserOrigin,
} from "./lib/phase-5-global-browser-origin.mjs";

test("maps the exact Global build to the fixed Google browser-key hostname", () => {
  assert.deepEqual(
    resolveGlobalBrowserOrigin("http://127.0.0.1:3100", approvedGoogleBrowserHostname, true),
    {
      browserBaseUrl: `http://${approvedGoogleBrowserHostname}:3100/`,
      hostResolverArgument: `--host-resolver-rules=MAP ${approvedGoogleBrowserHostname} 127.0.0.1`,
    },
  );
});

test("rejects unapproved Global browser-key hostnames and non-loopback servers", () => {
  assert.throws(
    () => resolveGlobalBrowserOrigin("http://127.0.0.1:3100", "preview.example", true),
    /approved production host/,
  );
  assert.throws(
    () =>
      resolveGlobalBrowserOrigin(
        "https://trip-planner-ivory-one.vercel.app/",
        approvedGoogleBrowserHostname,
        true,
      ),
    /root loopback HTTP URL/,
  );
});

test("keeps a remote browser origin unchanged when fixed-host smoke is disabled", () => {
  assert.deepEqual(resolveGlobalBrowserOrigin("https://preview.example/", undefined, false), {
    browserBaseUrl: "https://preview.example/",
    hostResolverArgument: null,
  });
});
