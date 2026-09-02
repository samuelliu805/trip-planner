import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { request as httpsRequest } from "node:https";
import test from "node:test";

import { startLoopbackTlsProxy } from "./lib/loopback-tls-proxy.mjs";
import { approvedAmapBrowserHostname } from "./lib/phase-5-cn-browser-origin.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function requestThroughProxy(url) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address: "127.0.0.1", family: 4 }]);
          else callback(null, "127.0.0.1", 4);
        },
        rejectUnauthorized: false,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve({ body, headers: response.headers }));
      },
    );
    request.once("error", reject);
    request.end();
  });
}

test("loopback TLS proxy preserves Secure cookies and the approved browser origin", async () => {
  const upstream = createHttpServer((request, response) => {
    response.setHeader(
      "set-cookie",
      "tp-cn-access-token=fixture; HttpOnly; Path=/; SameSite=Lax; Secure",
    );
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        forwardedHost: request.headers["x-forwarded-host"],
        forwardedProtocol: request.headers["x-forwarded-proto"],
      }),
    );
  });
  await listen(upstream);
  const address = upstream.address();
  assert.ok(address && typeof address !== "string");
  const proxy = await startLoopbackTlsProxy({
    browserHostname: approvedAmapBrowserHostname,
    upstreamBaseUrl: `http://127.0.0.1:${address.port}/`,
  });
  try {
    const response = await requestThroughProxy(new URL("/login", proxy.browserBaseUrl));
    assert.match(response.headers["set-cookie"]?.[0] ?? "", /; Secure$/);
    assert.deepEqual(JSON.parse(response.body), {
      forwardedHost: new URL(proxy.browserBaseUrl).host,
      forwardedProtocol: "https",
    });
  } finally {
    await proxy.close();
    await close(upstream);
  }
});

test("loopback TLS proxy rejects non-loopback upstreams and invalid browser hosts", async () => {
  await assert.rejects(
    startLoopbackTlsProxy({
      browserHostname: approvedAmapBrowserHostname,
      upstreamBaseUrl: "https://example.com/",
    }),
    /root loopback HTTP URL/,
  );
  await assert.rejects(
    startLoopbackTlsProxy({
      browserHostname: "bad host",
      upstreamBaseUrl: "http://127.0.0.1:3100/",
    }),
    /valid fixed hostname/,
  );
});
