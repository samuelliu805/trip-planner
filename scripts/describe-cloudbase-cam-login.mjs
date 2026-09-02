import { pathToFileURL } from "node:url";

import { readFirstJsonObject } from "./cloudbase-cli-json.mjs";

export function classifyCloudBaseCamLoginFailure(payload) {
  const error = payload?.error;
  const text = [error?.name, error?.code, error?.message]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (/secret.?id.*(?:not found|invalid)|invalid.*secret.?id/.test(text))
    return "credential-not-found";
  if (/signature|secret.?key.*(?:invalid|incorrect)/.test(text)) return "credential-rejected";
  if (/unauthorized|not authorized|permission|access denied|checktcbservice/.test(text))
    return "authorization";
  if (/authentication failed|authfailure|credential/.test(text)) return "credential-authentication";
  return "unknown";
}

export function camLoginFailureGuidance(category) {
  switch (category) {
    case "authorization":
      return "Verify that the CAM identity can call tcb:CheckTcbService.";
    case "credential-not-found":
    case "credential-rejected":
    case "credential-authentication":
      return "Replace both GitHub Environment CAM secrets from the same active SecretId/SecretKey pair.";
    default:
      return "Verify the CAM credential pair and tcb:CheckTcbService permission.";
  }
}

export async function describeCloudBaseCamLoginFailure(path) {
  let category = "unknown";
  try {
    category = classifyCloudBaseCamLoginFailure(await readFirstJsonObject(path));
  } catch {
    // The CLI may fail before emitting JSON. Keep the report bounded and secret-free.
  }
  process.stderr.write(
    `CloudBase CAM login failed (category=${category}). ${camLoginFailureGuidance(category)}\n`,
  );
  return category;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await describeCloudBaseCamLoginFailure(process.argv[2]);
}
