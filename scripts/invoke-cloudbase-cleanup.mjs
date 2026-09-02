import { pathToFileURL } from "node:url";

import { initializeAdminLiveApp } from "./lib/cloudbase-pg-live.mjs";

function required(name, environment = process.env) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required CloudBase cleanup invocation value: ${name}`);
  return value;
}

export function verifyCleanupInvocationResult(response) {
  let result = response?.result;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      throw new Error("CloudBase cleanup function returned invalid JSON.");
    }
  }
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    result.status !== "ok" ||
    typeof result.backlog !== "boolean" ||
    typeof result.assets?.deletedAssets !== "number" ||
    typeof result.shareImages?.revokedImages !== "number"
  ) {
    throw new Error("CloudBase cleanup function returned an invalid bounded result.");
  }
  return result;
}

export async function invokeCloudBaseCleanup(environment = process.env) {
  const apiKey = required("CLOUDBASE_API_KEY", environment);
  const env = required("CLOUDBASE_ENV_ID", environment);
  const region = required("CLOUDBASE_REGION", environment);
  if (apiKey !== environment.CLOUDBASE_API_KEY || /[\r\n{}]/.test(apiKey)) {
    throw new Error("CLOUDBASE_API_KEY has an invalid format.");
  }
  const app = initializeAdminLiveApp({
    CLOUDBASE_API_KEY: apiKey,
    CLOUDBASE_ENV_ID: env,
    CLOUDBASE_REGION: region,
  });
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error("CloudBase cleanup function invocation timed out.")),
      50_000,
    );
  });
  let response;
  try {
    response = await Promise.race([
      app.callFunction({
        data: { source: "phase5-verification" },
        name: "trip-planner-cleanup",
        parse: true,
      }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeout);
  }
  verifyCleanupInvocationResult(response);
  process.stdout.write(
    "Deployed CloudBase cleanup function returned its bounded success result.\n",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await invokeCloudBaseCleanup().catch(() => {
    process.stderr.write("CloudBase cleanup function invocation failed.\n");
    process.exitCode = 1;
  });
}
