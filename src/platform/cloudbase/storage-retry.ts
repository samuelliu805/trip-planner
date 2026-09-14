type StorageResult = Readonly<{ error?: unknown }>;

type StorageRetryOptions = Readonly<{
  attempts?: number;
  waitForRetry?: (milliseconds: number) => Promise<void>;
}>;

const transientStorageCodes = new Set([
  "ABORT_ERR",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ETIMEDOUT",
  "STORAGE_PG_ABORTED",
  "STORAGE_PG_NO_RESPONSE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function errorShape(error: unknown) {
  return error && typeof error === "object"
    ? (error as { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown })
    : {};
}

function transientStorageError(error: unknown) {
  const candidate = errorShape(error);
  const code = String(candidate.code ?? candidate.statusCode ?? "").toUpperCase();
  const status = Number(candidate.status ?? candidate.statusCode);
  const message = String(candidate.message ?? "");
  return (
    transientStorageCodes.has(code) ||
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599) ||
    /aborted|fetch failed|network(?: request)? failed|socket hang up|timed?\s*out|请求在\d+(?:\.\d+)?s内未完成|已中断/i.test(
      message,
    )
  );
}

async function defaultWait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function retryCloudBaseStorageMutation<T extends StorageResult>(
  operation: () => Promise<T>,
  options: StorageRetryOptions = {},
) {
  const attempts = Math.max(1, Math.min(options.attempts ?? 3, 3));
  const waitForRetry = options.waitForRetry ?? defaultWait;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await operation();
      if (!result.error || !transientStorageError(result.error) || attempt === attempts) {
        return result;
      }
    } catch (error) {
      if (!transientStorageError(error) || attempt === attempts) throw error;
    }
    await waitForRetry(250 * 2 ** (attempt - 1));
  }
  throw new Error("CloudBase Storage retry limit was not resolved.");
}
