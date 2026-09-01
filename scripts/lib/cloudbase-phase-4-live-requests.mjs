const transientCodes = new Set([
  "ABORT_ERR",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETDOWN",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "HARD_TIMEOUT",
  "STORAGE_PG_ABORTED",
  "STORAGE_PG_NO_RESPONSE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const storageAccessDenialCodes = new Set([
  "STORAGE_AUTHENTICATION_REQUIRED",
  "STORAGE_PERMISSION_DENIED",
  "STORAGE_UNAUTHORIZED",
]);

const genericAccessDenialCodes = new Set(["AUTHENTICATION_REQUIRED", "FORBIDDEN", "UNAUTHORIZED"]);

const mimeDenialCodes = new Set([
  "INVALID_MIME_TYPE",
  "MIME_TYPE_NOT_ALLOWED",
  "STORAGE_INVALID_MIME_TYPE",
  "STORAGE_MIME_TYPE_NOT_ALLOWED",
]);

const sizeDenialCodes = new Set([
  "ENTITY_TOO_LARGE",
  "FILE_SIZE_EXCEEDED",
  "FILE_SIZE_LIMIT_EXCEEDED",
  "PAYLOAD_TOO_LARGE",
  "STORAGE_FILE_SIZE_EXCEEDED",
  "STORAGE_FILE_SIZE_LIMIT_EXCEEDED",
  "STORAGE_FILE_TOO_LARGE",
]);

function errorCode(error) {
  const value = error?.code ?? error?.statusCode ?? "";
  return typeof value === "string" ? value.toUpperCase() : "";
}

function errorStatus(error) {
  const value = Number(error?.status ?? error?.statusCode);
  return Number.isInteger(value) ? value : null;
}

function storageBranded(error) {
  return (
    error?.__isStorageError === true ||
    ["StorageApiError", "StorageError", "StorageUnknownError"].includes(error?.name)
  );
}

export function safeCloudBaseError(error) {
  const code = String(error?.code ?? error?.statusCode ?? error?.name ?? "request_failed").slice(
    0,
    80,
  );
  const rawMessage = String(error?.message ?? "").trim() || "request failed";
  let message = rawMessage.replace(/https?:\/\/\S+/gi, "<url>");
  if (/bearer/i.test(message)) {
    message = message.replace(/bearer[\s\S]*/i, "Bearer <redacted>");
  }
  message = message
    .replace(/\b(api.?key|secret.?key|token|key.?id)\b\s*[:=]\s*["']?[^\s,"'}]+/gi, "$1=<redacted>")
    .slice(0, 160);
  return `${code} ${message}`;
}

export function isTransientCloudBaseFailure(error) {
  const visited = new Set();
  const pending = [error];
  while (pending.length) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const code = errorCode(current);
    const status = errorStatus(current);
    const description = `${current.name ?? ""} ${current.message ?? ""}`;
    if (
      transientCodes.has(code) ||
      status === 408 ||
      status === 429 ||
      (status != null && status >= 500 && status <= 599) ||
      /aborted|fetch failed|network(?: request)? failed|network.*timeout|socket hang up|timed?\s*out/i.test(
        description,
      )
    ) {
      return true;
    }
    pending.push(current.cause, current.originalError);
  }
  return false;
}

export function isExpectedCloudBaseStorageDenial(error, expected) {
  const code = errorCode(error);
  const status = errorStatus(error);
  const message = String(error?.message ?? "");
  const branded = storageBranded(error);

  if (expected === "access") {
    return (
      storageAccessDenialCodes.has(code) ||
      (branded && (genericAccessDenialCodes.has(code) || status === 401 || status === 403))
    );
  }
  if (expected === "invisible") {
    return (
      isExpectedCloudBaseStorageDenial(error, "access") ||
      (branded && status === 404 && code === "STORAGE_OBJECT_NOT_FOUND")
    );
  }
  if (expected === "mime") {
    return (
      (mimeDenialCodes.has(code) && (branded || code.startsWith("STORAGE_"))) ||
      (branded &&
        (status === 400 || status === 415) &&
        /(?:invalid|unsupported|not allowed|does not allow).{0,48}mime|mime.{0,48}(?:invalid|unsupported|not allowed|does not allow)/i.test(
          message,
        ))
    );
  }
  if (expected === "size") {
    return (
      (sizeDenialCodes.has(code) && (branded || code.startsWith("STORAGE_"))) ||
      (branded && status === 413) ||
      (branded &&
        status === 400 &&
        /(?:file|object|payload).{0,32}(?:size|large).{0,32}(?:exceed|limit|maximum|too large)|payload too large/i.test(
          message,
        ))
    );
  }
  throw new Error(`Unknown CloudBase Storage denial category: ${expected}`);
}

export async function withCloudBaseHardTimeout(operation, label, timeoutMilliseconds = 15_000) {
  let timer;
  return Promise.race([
    operation(),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error(`${label} timed out`), { code: "HARD_TIMEOUT" })),
        timeoutMilliseconds,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function runCloudBaseSdkCall(operation, label, options = {}) {
  const attempts = Math.max(1, Math.min(options.attempts ?? 3, 3));
  const backoffMilliseconds = Math.max(0, options.backoffMilliseconds ?? 250);
  const timeoutMilliseconds = Math.max(1, options.timeoutMilliseconds ?? 15_000);
  let result;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      result = await withCloudBaseHardTimeout(operation, label, timeoutMilliseconds);
    } catch (error) {
      result = { data: null, error };
    }
    if (!result?.error || !isTransientCloudBaseFailure(result.error) || attempt === attempts) {
      return result;
    }
    if (backoffMilliseconds) {
      await new Promise((resolve) => setTimeout(resolve, attempt * backoffMilliseconds));
    }
  }
  return result;
}

export async function requireCloudBaseStorageDenial({ expected, label, operation, ...options }) {
  const result = await runCloudBaseSdkCall(operation, label, options);
  if (!result?.error) throw new Error(`${label} unexpectedly succeeded`);
  if (!isExpectedCloudBaseStorageDenial(result.error, expected)) {
    throw new Error(`${label}: unexpected rejection ${safeCloudBaseError(result.error)}`, {
      cause: result.error,
    });
  }
  return result.error;
}
