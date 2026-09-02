import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { root } from "./cloudbase-pg-baseline-lib.mjs";

const require = createRequire(import.meta.url);
const cloudbase = require("@cloudbase/js-sdk");
const nodeAdapter = require("@cloudbase/adapter-node");

export const exactTarget = {
  CLOUDBASE_ENV_ID: "trip-planner-cn-dev-d3bz94038b26",
  CLOUDBASE_REGION: "ap-shanghai",
  CLOUDBASE_PG_INSTANCE_ID: "pgdb-l4lhtrv7",
};

export function loadLiveConfig() {
  const names = new Set([
    ...Object.keys(exactTarget),
    "CLOUDBASE_PUBLISHABLE_KEY",
    "CLOUDBASE_TEST_USER_A_PASSWORD",
    "CLOUDBASE_TEST_USER_B_PASSWORD",
  ]);
  const selected = {};
  const envPath = join(root, ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const separator = line.indexOf("=");
      const name = line.slice(0, separator);
      if (separator < 1 || !names.has(name)) continue;
      if (name in selected) throw new Error(`${name} is duplicated`);
      selected[name] = line.slice(separator + 1);
    }
  }
  for (const name of names) selected[name] = process.env[name] || selected[name];
  for (const name of names) if (!selected[name]) throw new Error(`${name} is unavailable`);
  for (const [name, expected] of Object.entries(exactTarget)) {
    if (selected[name] !== expected) throw new Error(`Unexpected CloudBase target: ${name}`);
  }
  return selected;
}

export function initializeLiveClient(config) {
  if (cloudbase.version !== "3.9.0") throw new Error("CloudBase JS SDK version drift");
  cloudbase.useAdapters(nodeAdapter);
  const app = cloudbase.init({
    env: config.CLOUDBASE_ENV_ID,
    region: config.CLOUDBASE_REGION,
    accessKey: config.CLOUDBASE_PUBLISHABLE_KEY,
    auth: { detectSessionInUrl: false },
  });
  return { app, auth: app.auth, db: app.rdb(), storage: app.storage };
}

export function initializeAdminLiveApp(config) {
  const apiKey = config.CLOUDBASE_API_KEY;
  if (!apiKey || apiKey.trim() !== apiKey || /[\r\n{}]/.test(apiKey)) {
    throw new Error("CLOUDBASE_API_KEY has an invalid format");
  }
  if (cloudbase.version !== "3.9.0") throw new Error("CloudBase JS SDK version drift");
  cloudbase.useAdapters(nodeAdapter);
  return cloudbase.init({
    accessKey: apiKey,
    auth: { detectSessionInUrl: false },
    env: config.CLOUDBASE_ENV_ID,
    persistence: "none",
    region: config.CLOUDBASE_REGION,
    timeout: 45_000,
  });
}

export function dataOrThrow(result, label) {
  if (result?.error) {
    const code = result.error.code || "request_failed";
    const reason = String(result.error.message ?? "request failed").slice(0, 160);
    throw new Error(`${label}: ${code} ${reason}`);
  }
  return result?.data;
}

export async function signIn(auth, username, password) {
  dataOrThrow(await auth.signInWithPassword({ username, password }), `${username} login`);
  const sessionData = dataOrThrow(await auth.getSession(), `${username} session`);
  const session = sessionData?.session ?? sessionData;
  const id = String(session?.user?.id ?? session?.user?.sub ?? session?.sub ?? "");
  if (!id) throw new Error(`${username} session identity is unavailable`);
  return id;
}

export function scalar(data) {
  if (Array.isArray(data)) return data[0]?.id ?? data[0] ?? null;
  if (data && typeof data === "object") return data.id ?? data.value ?? data;
  return data;
}

export function functionAclDenied(result, functionName) {
  const code = String(result?.error?.code ?? "");
  const message = String(result?.error?.message ?? "");
  return code === "DATABASE_42501" && message === `permission denied for function ${functionName}`;
}

export function gatewayFunctionUnavailable(result, functionName) {
  const code = String(result?.error?.code ?? "");
  const message = String(result?.error?.message ?? "");
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    code === "DATABASE_PGRST202" &&
    new RegExp(
      `^Could not find the function public\\.${escaped}(?: without parameters|\\([^)]*\\)) in the schema cache$`,
    ).test(message)
  );
}
