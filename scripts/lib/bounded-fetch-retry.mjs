function defaultWait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function boundedRetryFetch(input, init = {}, options = {}) {
  const attempts = options.attempts ?? 3;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const maximumDelayMs = options.maximumDelayMs ?? 4_000;
  const retryDelayMs = options.retryDelayMs ?? 250;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const wait = options.waitImplementation ?? defaultWait;

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new TypeError("boundedRetryFetch requires at least one attempt.");
  }

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await fetchImplementation(input, { ...init, signal });
      if (response.status < 500 || attempt === attempts) return response;
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (init.signal?.aborted || attempt === attempts) throw error;
      lastError = error;
    }
    await wait(Math.min(retryDelayMs * 2 ** (attempt - 1), maximumDelayMs));
  }

  throw lastError ?? new Error("Bounded fetch retry budget was exhausted.");
}
