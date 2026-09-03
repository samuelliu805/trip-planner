import { pathToFileURL } from "node:url";

import { readFirstJsonObject } from "./cloudbase-cli-json.mjs";

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

export function classifyCleanupRuntimeFailure(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const message = String(result.errorMessage ?? "");
  const stack = String(result.stackTrace ?? "");
  const description = `${message}\n${stack}`;
  if (/Cannot use import statement outside a module/i.test(description)) {
    return "node-module-format";
  }
  if (/Missing required cleanup runtime configuration/i.test(description)) {
    return "runtime-configuration";
  }
  if (
    /CLEANUP_|batch unavailable|storage removal failed|could not be finalized/i.test(description)
  ) {
    return "cleanup-operation";
  }
  return typeof result.statusCode === "number" || typeof result.errorCode === "number"
    ? "user-code-exception"
    : null;
}

export async function verifyCloudBaseCleanupInvocation(path) {
  if (!path) throw new Error("CloudBase cleanup invocation output is unavailable.");
  const payload = await readFirstJsonObject(path);
  const invocation = payload?.data;
  if (
    !invocation ||
    typeof invocation !== "object" ||
    Array.isArray(invocation) ||
    invocation.functionType !== "Event" ||
    invocation.InvokeResult !== 0
  ) {
    throw new Error("CloudBase cleanup function invocation was not successful.");
  }
  let result = invocation.RetMsg;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      throw new Error("CloudBase cleanup function returned invalid JSON.");
    }
  }
  const runtimeFailure = classifyCleanupRuntimeFailure(result);
  if (runtimeFailure) {
    throw new Error(
      `CloudBase cleanup function returned a bounded runtime failure (category=${runtimeFailure}).`,
    );
  }
  verifyCleanupInvocationResult({ result });
  process.stdout.write(
    "Deployed CloudBase cleanup function returned its bounded success result.\n",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyCloudBaseCleanupInvocation(process.argv[2]).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "CloudBase cleanup function invocation failed."}\n`,
    );
    process.exitCode = 1;
  });
}
