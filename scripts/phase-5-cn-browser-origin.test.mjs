import assert from "node:assert/strict";
import test from "node:test";

import {
  approvedAmapBrowserHostname,
  chromiumProxyArguments,
  resolveCnBrowserOrigin,
} from "./lib/phase-5-cn-browser-origin.mjs";

test("CN Chrome uses an ambient proxy while keeping the loopback origin direct", () => {
  assert.deepEqual(
    chromiumProxyArguments(
      { HTTPS_PROXY: "http://proxy.example:8080" },
      approvedAmapBrowserHostname,
    ),
    [
      "--proxy-server=http://proxy.example:8080",
      `--proxy-bypass-list=${approvedAmapBrowserHostname};localhost;127.0.0.1;[::1]`,
    ],
  );
  assert.deepEqual(chromiumProxyArguments({}, approvedAmapBrowserHostname), ["--no-proxy-server"]);
});

test("CN Chrome rejects proxy URLs that would expose credentials in process arguments", () => {
  assert.throws(
    () => chromiumProxyArguments({ HTTPS_PROXY: "http://user:password@proxy.example" }),
    /without credentials/,
  );
});

test("CN AMap browser smoke maps only the approved hostname to loopback", () => {
  assert.deepEqual(
    resolveCnBrowserOrigin("http://127.0.0.1:3100", approvedAmapBrowserHostname, true),
    {
      browserBaseUrl: `http://${approvedAmapBrowserHostname}:3100/`,
      hostResolverArgument: `--host-resolver-rules=MAP ${approvedAmapBrowserHostname} 127.0.0.1`,
    },
  );
});

test("CN AMap browser smoke rejects unapproved or non-loopback targets", () => {
  assert.throws(
    () => resolveCnBrowserOrigin("http://127.0.0.1:3100", "evil.example", true),
    /approved CloudBase Run host/,
  );
  assert.throws(
    () => resolveCnBrowserOrigin("https://example.test/", approvedAmapBrowserHostname, true),
    /root loopback HTTP URL/,
  );
});

test("non-AMap browser smoke preserves its configured origin", () => {
  assert.deepEqual(resolveCnBrowserOrigin("https://preview.example/", undefined, false), {
    browserBaseUrl: "https://preview.example/",
    hostResolverArgument: null,
  });
});
