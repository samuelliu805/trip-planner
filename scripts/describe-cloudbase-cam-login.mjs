import { readFile } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";
import { pathToFileURL } from "node:url";

import { parseFirstJsonObject } from "./cloudbase-cli-json.mjs";

export function classifyCloudBaseCamLoginText(input) {
  const text = stripVTControlCharacters(String(input)).slice(0, 65_536).toLowerCase();
  if (
    /secret.?id.*(?:not found|invalid|does not exist)|invalid.*secret.?id|secretid.*(?:不存在|无效|错误)/.test(
      text,
    )
  )
    return "credential-not-found";
  if (
    /signature|secret.?key.*(?:invalid|incorrect)|(?:invalid|incorrect).*secret.?key|签名.*(?:失败|错误)|secretkey.*(?:无效|错误)/.test(
      text,
    )
  )
    return "credential-rejected";
  if (
    /unauthorized|not authorized|permission|access denied|checktcbservice|无权限|没有权限|未授权|拒绝访问/.test(
      text,
    )
  )
    return "authorization";
  if (
    /authentication failed|authfailure|credential|cam authentication|身份验证失败|认证失败|鉴权失败|登录失败/.test(
      text,
    )
  )
    return "credential-authentication";
  return "unknown";
}

export function classifyCloudBaseCamLoginFailure(payload) {
  const error = payload?.error;
  const text = [error?.name, error?.code, error?.message]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return classifyCloudBaseCamLoginText(text);
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
    const raw = await readFile(path, "utf8");
    try {
      category = classifyCloudBaseCamLoginFailure(parseFirstJsonObject(raw));
    } catch {
      category = classifyCloudBaseCamLoginText(raw);
    }
    if (category === "unknown") category = classifyCloudBaseCamLoginText(raw);
  } catch {
    // Keep the report bounded and secret-free when the CLI output cannot be read.
  }
  process.stderr.write(
    `CloudBase CAM login failed (category=${category}). ${camLoginFailureGuidance(category)}\n`,
  );
  return category;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await describeCloudBaseCamLoginFailure(process.argv[2]);
}
