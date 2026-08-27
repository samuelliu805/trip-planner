import { timingSafeEqual } from "node:crypto";

import { resolveTelemetryConfig, type TelemetryEnvironmentVariables } from "./config.ts";
import { SafeTelemetryError } from "./errors.ts";

export type TelemetrySmokeKind = "server_exception" | "structured_log";

type SmokeEnvironment = TelemetryEnvironmentVariables &
  Partial<Record<"TELEMETRY_SMOKE_TEST_ENABLED" | "TELEMETRY_SMOKE_TEST_TOKEN", string>>;

export type TelemetrySmokeDependencies = {
  captureException: (error: Error) => Promise<void>;
  env: SmokeEnvironment;
  logWarning: () => void;
};

function notFound() {
  return Response.json(
    { accepted: false },
    { headers: { "Cache-Control": "no-store" }, status: 404 },
  );
}

function tokensMatch(expected: string, actual: string | null): boolean {
  if (!actual) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(actual, "utf8");
  if (expectedBytes.length !== actualBytes.length) {
    timingSafeEqual(expectedBytes, expectedBytes);
    return false;
  }
  return timingSafeEqual(expectedBytes, actualBytes);
}

async function parseKind(request: Request): Promise<TelemetrySmokeKind | null> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 100) return null;
  try {
    const text = await request.text();
    if (text.length > 100) return null;
    const body = JSON.parse(text) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const record = body as Record<string, unknown>;
    if (Object.keys(record).length !== 1) return null;
    return record.kind === "structured_log" || record.kind === "server_exception"
      ? record.kind
      : null;
  } catch {
    return null;
  }
}

export async function handleTelemetrySmokeRequest(
  request: Request,
  dependencies: TelemetrySmokeDependencies,
): Promise<Response> {
  const { env } = dependencies;
  const config = resolveTelemetryConfig(env, { validateVercelEnvironment: true });
  const smokeToken = env.TELEMETRY_SMOKE_TEST_TOKEN ?? "";
  if (
    env.VERCEL_ENV !== "preview" ||
    env.TELEMETRY_SMOKE_TEST_ENABLED !== "true" ||
    smokeToken.length < 32 ||
    !config.enabled ||
    config.environment !== "preview"
  ) {
    return notFound();
  }
  if (!tokensMatch(smokeToken, request.headers.get("x-telemetry-smoke-token"))) {
    return notFound();
  }

  const kind = await parseKind(request);
  if (!kind) {
    return Response.json(
      { accepted: false },
      { headers: { "Cache-Control": "no-store" }, status: 400 },
    );
  }

  try {
    if (kind === "structured_log") dependencies.logWarning();
    else {
      await dependencies.captureException(new SafeTelemetryError("synthetic_preview_exception"));
    }
  } catch {
    // This acceptance helper reports delivery out-of-band in PostHog.
  }
  return Response.json(
    { accepted: true, kind },
    { headers: { "Cache-Control": "no-store" }, status: 202 },
  );
}
