type RetryOptions = Readonly<{
  attempts?: number;
  retryDelayMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
}>;

const transientReadPattern =
  /aborted|fetch failed|network(?: request)? failed|socket hang up|econnreset|etimedout|timed?\s*out/i;

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error)
    return `${value.name}: ${value.message} ${value.cause ? errorText(value.cause) : ""}`;
  if (!value || typeof value !== "object") return "";
  const candidate = value as { code?: unknown; error?: unknown; message?: unknown };
  return [candidate.code, candidate.message, candidate.error]
    .map((part) => errorText(part))
    .join(" ");
}

export function isTransientReadFailure(value: unknown) {
  return transientReadPattern.test(errorText(value));
}

export async function retryTransientRead<Result>(
  read: () => Promise<Result>,
  options: RetryOptions = {},
): Promise<Result> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const retryDelayMs = options.retryDelayMs ?? 150;
  const wait =
    options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastResult: Result | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await read();
      if (!isTransientReadFailure(result)) return result;
      lastResult = result;
      lastError = undefined;
    } catch (error) {
      if (!isTransientReadFailure(error)) throw error;
      lastError = error;
    }
    if (attempt < attempts) await wait(retryDelayMs * 2 ** (attempt - 1));
  }

  if (lastError) throw lastError;
  return lastResult as Result;
}
