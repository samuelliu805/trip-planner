import assert from "node:assert/strict";
import test from "node:test";

import { ipv4AddressesFromDnsJson, selectReachableAmapAddress } from "./select-amap-ci-edge.mjs";

test("AMap edge selection accepts only IPv4 A records", () => {
  assert.deepEqual(
    ipv4AddressesFromDnsJson({
      Answer: [
        { data: "restapi.amap.com.gds.alibabadns.com.", type: 5 },
        { data: "59.82.132.217", type: 1 },
        { data: "2408:4001:f00::10f7", type: 28 },
        { data: "not-an-address", type: 1 },
      ],
    }),
    ["59.82.132.217"],
  );
  assert.deepEqual(ipv4AddressesFromDnsJson(null), []);
});

test("AMap edge selection keeps failures isolated and returns a reachable address", async () => {
  const attempts = [];
  const selected = await selectReachableAmapAddress(["203.0.113.1", "198.51.100.2"], {
    probeImplementation: async (address) => {
      attempts.push(address);
      if (address === "203.0.113.1") throw new Error("unreachable");
      return address;
    },
  });

  assert.equal(selected, "198.51.100.2");
  assert.deepEqual(attempts, ["203.0.113.1", "198.51.100.2"]);
});

test("AMap edge selection fails closed when no candidate is reachable", async () => {
  await assert.rejects(
    selectReachableAmapAddress(["203.0.113.1"], {
      probeImplementation: async () => {
        throw new Error("unreachable");
      },
    }),
    /No resolved AMap edge passed the bounded TLS probe/,
  );
});
