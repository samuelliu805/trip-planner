import { normalizeGooglePlace } from "./normalize-google-place.ts";

const autocompleteEndpoint = "https://places.googleapis.com/v1/places:autocomplete";
const detailsEndpoint = "https://places.googleapis.com/v1/places/";
const maximumResponseBytes = 512 * 1024;
const maximumAttempts = 3;

type GooglePlacesApiOptions = {
  apiKey: string;
  fetchImplementation?: typeof fetch;
  retryDelayMs?: number;
  timeoutMs?: number;
};

const jsonHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { headers: jsonHeaders, status });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validSession(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function allowedParameters(url: URL, operation: string) {
  const allowed =
    operation === "suggest"
      ? new Set(["input", "operation", "session", "types"])
      : new Set(["id", "operation", "session"]);
  return [...url.searchParams.keys()].every((name) => allowed.has(name));
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

async function readPayload(
  url: string,
  init: RequestInit,
  requestSignal: AbortSignal,
  options: GooglePlacesApiOptions,
) {
  if (!options.apiKey.trim()) throw new Error("configuration");
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    requestSignal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(onAbort, options.timeoutMs ?? 8_000);
    let response: Response;
    try {
      response = await (options.fetchImplementation ?? fetch)(url, {
        ...init,
        headers: { ...init.headers, "X-Goog-Api-Key": options.apiKey.trim() },
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
    const payload = JSON.parse(new TextDecoder().decode(body)) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("invalid-response");
    }
    return payload as Record<string, unknown>;
  }
  throw new Error("upstream");
}

function autocompleteSuggestions(payload: Record<string, unknown>) {
  const values = Array.isArray(payload.suggestions) ? payload.suggestions : [];
  return values.slice(0, 10).flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const prediction = (value as Record<string, unknown>).placePrediction;
    if (!prediction || typeof prediction !== "object" || Array.isArray(prediction)) return [];
    const record = prediction as Record<string, unknown>;
    const structured =
      record.structuredFormat &&
      typeof record.structuredFormat === "object" &&
      !Array.isArray(record.structuredFormat)
        ? (record.structuredFormat as Record<string, unknown>)
        : {};
    const part = (name: string) => {
      const candidate = structured[name];
      return candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? text((candidate as Record<string, unknown>).text)
        : "";
    };
    const id = text(record.placeId);
    const primary = part("mainText");
    const secondary = part("secondaryText");
    return id && primary ? [{ id, primary, ...(secondary && { secondary }) }] : [];
  });
}

export async function handleGooglePlacesRequest(request: Request, options: GooglePlacesApiOptions) {
  if (request.method !== "GET") return errorResponse("Method not allowed.", 405);
  const url = new URL(request.url);
  const operation = url.searchParams.get("operation") ?? "";
  const session = url.searchParams.get("session") ?? "";
  if (
    (operation !== "suggest" && operation !== "resolve") ||
    !allowedParameters(url, operation) ||
    !validSession(session)
  ) {
    return errorResponse("Invalid Google places request.", 400);
  }

  try {
    if (operation === "suggest") {
      const input = url.searchParams.get("input")?.normalize("NFKC").trim() ?? "";
      const types = (url.searchParams.get("types") ?? "").split(",").filter(Boolean);
      if (
        !input ||
        input.length > 80 ||
        types.length > 5 ||
        types.some((type) => !/^[a-z_]{1,64}$/.test(type))
      ) {
        return errorResponse("Invalid Google places request.", 400);
      }
      const payload = await readPayload(
        autocompleteEndpoint,
        {
          body: JSON.stringify({
            input,
            sessionToken: session,
            ...(types.length ? { includedPrimaryTypes: types } : null),
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
        request.signal,
        options,
      );
      return Response.json(
        { suggestions: autocompleteSuggestions(payload) },
        { headers: jsonHeaders },
      );
    }

    const id = url.searchParams.get("id")?.trim() ?? "";
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(id)) {
      return errorResponse("Invalid Google places request.", 400);
    }
    const details = new URL(`${detailsEndpoint}${encodeURIComponent(id)}`);
    details.searchParams.set("sessionToken", session);
    const payload = await readPayload(
      details.href,
      {
        headers: {
          "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents",
        },
        method: "GET",
      },
      request.signal,
      options,
    );
    const displayName =
      payload.displayName &&
      typeof payload.displayName === "object" &&
      !Array.isArray(payload.displayName)
        ? text((payload.displayName as Record<string, unknown>).text)
        : "";
    const location =
      payload.location && typeof payload.location === "object" && !Array.isArray(payload.location)
        ? (payload.location as Record<string, unknown>)
        : {};
    const place = normalizeGooglePlace({
      addressComponents: Array.isArray(payload.addressComponents)
        ? (payload.addressComponents as never)
        : [],
      displayName,
      formattedAddress: text(payload.formattedAddress),
      id: text(payload.id),
      location: { lat: Number(location.latitude), lng: Number(location.longitude) },
    });
    if (place.providerPlaceId !== id)
      return errorResponse("Google returned an invalid place.", 502);
    return Response.json({ place }, { headers: jsonHeaders });
  } catch (error) {
    const category = error instanceof Error ? error.message : "upstream";
    if (category === "configuration")
      return errorResponse("Google places are not configured.", 503);
    if (category === "cancelled") return errorResponse("Google places request was cancelled.", 499);
    if (category === "timeout") return errorResponse("Google places request timed out.", 504);
    if (category === "throttled") return errorResponse("Google places request was throttled.", 429);
    return errorResponse("Google places are unavailable.", 502);
  }
}
