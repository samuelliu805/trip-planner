import { resolve4 } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

import { boundedRetryFetch } from "./lib/bounded-fetch-retry.mjs";

const amapHostname = "restapi.amap.com";
const resolverUrls = [
  `https://cloudflare-dns.com/dns-query?name=${amapHostname}&type=A`,
  `https://dns.google/resolve?name=${amapHostname}&type=A`,
];

export function ipv4AddressesFromDnsJson(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.Answer)) return [];
  return payload.Answer.flatMap((answer) => {
    if (!answer || typeof answer !== "object" || answer.type !== 1) return [];
    return typeof answer.data === "string" && isIP(answer.data) === 4 ? [answer.data] : [];
  });
}

async function resolveWithDoh(url) {
  const response = await boundedRetryFetch(
    url,
    { headers: { Accept: "application/dns-json" }, redirect: "error" },
    { attempts: 2, retryDelayMs: 250, timeoutMs: 5_000 },
  );
  if (!response.ok) throw new Error(`DNS resolver returned ${response.status}.`);
  return ipv4AddressesFromDnsJson(await response.json());
}

export async function resolveAmapIpv4Candidates() {
  const resolutions = await Promise.allSettled([
    ...resolverUrls.map(resolveWithDoh),
    resolve4(amapHostname),
  ]);
  const addresses = resolutions.flatMap((resolution) =>
    resolution.status === "fulfilled" ? resolution.value : [],
  );
  return [...new Set(addresses.filter((address) => isIP(address) === 4))];
}

export function probeAmapAddress(address, { signal, timeoutMs = 6_000 } = {}) {
  if (isIP(address) !== 4) return Promise.reject(new Error("AMap edge must be IPv4."));
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      headers: { Accept: "application/json", Host: amapHostname },
      host: address,
      method: "GET",
      path: "/v3/assistant/inputtips?keywords=health&output=json",
      servername: amapHostname,
      signal,
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("AMap edge probe timed out.")));
    request.once("error", reject);
    request.once("response", (response) => {
      response.resume();
      const status = response.statusCode ?? 0;
      if (status >= 200 && status < 500) resolve(address);
      else reject(new Error(`AMap edge probe returned ${status}.`));
      request.destroy();
    });
    request.end();
  });
}

export async function selectReachableAmapAddress(
  addresses,
  { probeImplementation = probeAmapAddress } = {},
) {
  if (!addresses.length) throw new Error("No AMap IPv4 candidates were resolved.");
  const controller = new AbortController();
  try {
    return await Promise.any(
      addresses.map((address) => probeImplementation(address, { signal: controller.signal })),
    );
  } catch {
    throw new Error("No resolved AMap edge passed the bounded TLS probe.");
  } finally {
    controller.abort();
  }
}

async function run() {
  const addresses = await resolveAmapIpv4Candidates();
  const selected = await selectReachableAmapAddress(addresses);
  process.stdout.write(`${selected}\n`);
}

const executedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href;
if (executedDirectly) {
  run().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "AMap edge selection failed."}\n`,
    );
    process.exitCode = 1;
  });
}
