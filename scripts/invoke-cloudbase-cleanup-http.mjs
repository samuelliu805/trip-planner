import { pathToFileURL } from "node:url";

import { verifyCleanupInvocationResult } from "./invoke-cloudbase-cleanup.mjs";

const maximumResponseBytes = 65_536;
const envIdPattern = /^[a-z0-9][a-z0-9-]{2,63}$/;

async function boundedResponseText(response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
    throw new Error("CloudBase cleanup HTTP response exceeded its size limit.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumResponseBytes) {
      await reader.cancel();
      throw new Error("CloudBase cleanup HTTP response exceeded its size limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function failureCategory(status, payload) {
  const code = typeof payload?.code === "string" ? payload.code.toUpperCase() : "";
  if (status === 401 || status === 403 || /AUTHORITY|FORBIDDEN|AUTH/.test(code)) {
    return "authorization";
  }
  if (status === 404 || code === "FUNCTIONS_NOT_FOUND") return "function-not-found";
  if (/TIME_LIMIT|TIMEOUT/.test(code)) return "timeout";
  if (/STATUS_ABNORMAL/.test(code)) return "function-status";
  if (/INVOCATION_FAILED/.test(code)) return "function-runtime";
  return `http-${status}`;
}

export async function invokeCloudBaseCleanupHttp({
  apiKey,
  envId,
  fetchImpl = fetch,
  signal = AbortSignal.timeout(60_000),
}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("CloudBase cleanup HTTP invocation requires CLOUDBASE_API_KEY.");
  }
  if (typeof envId !== "string" || !envIdPattern.test(envId)) {
    throw new Error("CloudBase cleanup HTTP invocation requires a valid environment ID.");
  }
  const response = await fetchImpl(
    `https://${envId}.api.tcloudbasegateway.com/v1/functions/trip-planner-cleanup`,
    {
      body: JSON.stringify({ source: "phase5-verification" }),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal,
    },
  );
  const text = await boundedResponseText(response);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("CloudBase cleanup HTTP response was not valid JSON.");
  }
  if (!response.ok) {
    throw new Error(
      `CloudBase cleanup HTTP invocation failed (category=${failureCategory(response.status, payload)}).`,
    );
  }
  // The fixed CloudBase Functions HTTP API returns the Event Function's JSON value directly.
  // The CLI uses a separate `{ data: { RetMsg } }` envelope, which is normalized by
  // verifyCloudBaseCleanupInvocation instead.
  verifyCleanupInvocationResult({ result: payload });
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await invokeCloudBaseCleanupHttp({
    apiKey: process.env.CLOUDBASE_API_KEY,
    envId: process.env.CLOUDBASE_ENV_ID,
  })
    .then(() => {
      process.stdout.write(
        "Deployed CloudBase cleanup function returned its bounded success result through the fixed HTTP API.\n",
      );
    })
    .catch((error) => {
      const message =
        error instanceof Error ? error.message : "CloudBase cleanup HTTP invocation failed.";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
