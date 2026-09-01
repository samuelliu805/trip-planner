import { createRequire } from "node:module";

import { exactTarget } from "./cloudbase-pg-live.mjs";

const require = createRequire(import.meta.url);
const cloudbase = require("@cloudbase/js-sdk");
const nodeAdapter = require("@cloudbase/adapter-node");
const allowedBuckets = new Set(["share-images", "trip-assets"]);

function normalizeError(error) {
  if (!error) return null;
  return {
    __isStorageError: error.__isStorageError === true,
    code: error.code ?? null,
    message: String(error.message ?? "request failed"),
    name: error.name ?? "Error",
    status: error.status ?? null,
    statusCode: error.statusCode ?? null,
  };
}

function validateAction(action) {
  if (!action || !allowedBuckets.has(action.bucket)) {
    throw new Error("Admin Storage action has an invalid bucket");
  }
  const paths = action.paths ?? [action.path];
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.some(
      (path) =>
        typeof path !== "string" ||
        path.length > 512 ||
        path.startsWith("/") ||
        path.includes(".."),
    )
  ) {
    throw new Error("Admin Storage action has an invalid path");
  }
}

async function execute(action) {
  validateAction(action);
  const apiKey = process.env.CLOUDBASE_API_KEY;
  if (!apiKey || apiKey.trim() !== apiKey || /[\r\n{}]/.test(apiKey)) {
    throw new Error("CLOUDBASE_API_KEY has an invalid format");
  }
  cloudbase.useAdapters(nodeAdapter);
  const app = cloudbase.init({
    accessKey: apiKey,
    auth: { detectSessionInUrl: false },
    env: exactTarget.CLOUDBASE_ENV_ID,
    persistence: "none",
    region: exactTarget.CLOUDBASE_REGION,
  });
  const storage = app.storage.from(action.bucket);
  if (action.type === "createSignedUploadUrl") {
    return storage.createSignedUploadUrl(action.path, { upsert: action.upsert === true });
  }
  if (action.type === "createSignedUrl") {
    return storage.createSignedUrl(action.path, 60);
  }
  if (action.type === "remove") {
    return storage.remove(action.paths);
  }
  if (action.type === "upload") {
    if (
      !Array.isArray(action.bytes) ||
      action.bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
    ) {
      throw new Error("Admin Storage upload has invalid bytes");
    }
    return storage.upload(action.path, Uint8Array.from(action.bytes), {
      contentType: action.contentType,
      upsert: action.upsert === true,
    });
  }
  throw new Error("Admin Storage action type is invalid");
}

async function executeWithHardTimeout(action) {
  let timer;
  try {
    return await Promise.race([
      execute(action),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Object.assign(new Error("CloudBase admin Storage worker timed out"), {
                code: "HARD_TIMEOUT",
              }),
            ),
          15_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

let result;
try {
  const action = JSON.parse(process.argv[2] ?? "null");
  const response = await executeWithHardTimeout(action);
  result = { data: response?.data ?? null, error: normalizeError(response?.error) };
} catch (error) {
  result = { data: null, error: normalizeError(error) };
}

process.stdout.write(`CLOUDBASE_ADMIN_RESULT=${JSON.stringify(result)}\n`, () => process.exit(0));
