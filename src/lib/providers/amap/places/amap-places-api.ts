import { normalizeAmapPlace } from "./normalize-amap-place.ts";

const upstreamByOperation = {
  resolve: "https://restapi.amap.com/v3/place/detail",
  suggest: "https://restapi.amap.com/v3/assistant/inputtips",
} as const;
const maximumResponseBytes = 512 * 1024;

type AmapPlacesApiOptions = {
  apiKey: string;
  fetchImplementation?: typeof fetch;
  retryDelayMs?: number;
  timeoutMs?: number;
};

const maximumAttempts = 3;

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { headers: responseHeaders(), status });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function waitForRetry(signal: AbortSignal, delayMs: number) {
  if (signal.aborted) throw new Error("cancelled");
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error("cancelled"));
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function readAmapPayload(
  operation: keyof typeof upstreamByOperation,
  parameters: URLSearchParams,
  requestSignal: AbortSignal,
  options: AmapPlacesApiOptions,
) {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new Error("configuration");
  const upstream = new URL(upstreamByOperation[operation]);
  for (const [name, value] of parameters) upstream.searchParams.set(name, value);
  upstream.searchParams.set("key", apiKey);
  upstream.searchParams.set("output", "json");

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    if (requestSignal.aborted) throw new Error("cancelled");
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    requestSignal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(onAbort, options.timeoutMs ?? 8_000);
    let response: Response;
    try {
      response = await (options.fetchImplementation ?? fetch)(upstream, {
        headers: { Accept: "application/json" },
        method: "GET",
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      const category = requestSignal.aborted
        ? "cancelled"
        : controller.signal.aborted
          ? "timeout"
          : "upstream";
      if (category === "cancelled" || attempt === maximumAttempts) throw new Error(category);
      await waitForRetry(requestSignal, (options.retryDelayMs ?? 200) * attempt);
      continue;
    } finally {
      clearTimeout(timeout);
      requestSignal.removeEventListener("abort", onAbort);
    }
    if (!response.ok) {
      if (response.status >= 500 && attempt < maximumAttempts) {
        await response.body?.cancel().catch(() => undefined);
        await waitForRetry(requestSignal, (options.retryDelayMs ?? 200) * attempt);
        continue;
      }
      throw new Error(response.status === 429 ? "throttled" : "upstream");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
      throw new Error("invalid-response");
    }
    const body = await response.arrayBuffer();
    if (body.byteLength > maximumResponseBytes) throw new Error("invalid-response");
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new Error("invalid-response");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("invalid-response");
    }
    if (!("status" in payload) || String(payload.status) !== "1") throw new Error("provider");
    return payload as Record<string, unknown>;
  }
  throw new Error("upstream");
}

function allowedParameters(url: URL, operation: string) {
  const names = new Set([...url.searchParams.keys()]);
  const allowed = operation === "suggest" ? ["input", "operation", "types"] : ["id", "operation"];
  return [...names].every((name) => allowed.includes(name));
}

export async function handleAmapPlacesRequest(request: Request, options: AmapPlacesApiOptions) {
  if (request.method !== "GET") return errorResponse("Method not allowed.", 405);
  const url = new URL(request.url);
  const operation = url.searchParams.get("operation") ?? "";
  if ((operation !== "suggest" && operation !== "resolve") || !allowedParameters(url, operation)) {
    return errorResponse("Invalid AMap places request.", 400);
  }

  try {
    if (operation === "suggest") {
      const input = url.searchParams.get("input")?.trim() ?? "";
      const types = url.searchParams.get("types")?.trim() ?? "";
      if (!input || input.length > 80 || (types && !/^\d{6}(?:\|\d{6})*$/.test(types))) {
        return errorResponse("Invalid AMap places request.", 400);
      }
      const parameters = new URLSearchParams({
        citylimit: "false",
        datatype: "poi",
        keywords: input,
        ...(types && { type: types }),
      });
      const payload = await readAmapPayload("suggest", parameters, request.signal, options);
      const tips = Array.isArray(payload.tips) ? payload.tips : [];
      const suggestions = tips.slice(0, 25).flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const tip = value as Record<string, unknown>;
        const id = text(tip.id);
        const primary = text(tip.name);
        if (!id || !primary || !/^[A-Za-z0-9]{1,64}$/.test(id)) return [];
        const address = Array.isArray(tip.address) ? text(tip.address[0]) : text(tip.address);
        const secondary = [text(tip.district), address].filter(Boolean).join(" · ");
        return [{ id, primary, ...(secondary && { secondary }) }];
      });
      return Response.json({ suggestions }, { headers: responseHeaders() });
    }

    const id = url.searchParams.get("id")?.trim() ?? "";
    if (!/^[A-Za-z0-9]{1,64}$/.test(id)) {
      return errorResponse("Invalid AMap places request.", 400);
    }
    const payload = await readAmapPayload(
      "resolve",
      new URLSearchParams({ extensions: "all", id }),
      request.signal,
      options,
    );
    const candidate = Array.isArray(payload.pois) ? payload.pois[0] : null;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return errorResponse("AMap returned an invalid place.", 502);
    }
    const place = normalizeAmapPlace(candidate);
    if (place.providerPlaceId !== id) return errorResponse("AMap returned an invalid place.", 502);
    return Response.json({ place }, { headers: responseHeaders() });
  } catch (error) {
    const category = error instanceof Error ? error.message : "upstream";
    if (category === "configuration") return errorResponse("AMap places are not configured.", 503);
    if (category === "cancelled") return errorResponse("AMap places request was cancelled.", 499);
    if (category === "timeout") return errorResponse("AMap places request timed out.", 504);
    if (category === "throttled") return errorResponse("AMap places request was throttled.", 429);
    return errorResponse("AMap places are unavailable.", 502);
  }
}
