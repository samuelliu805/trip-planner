import type {
  AuthFlow,
  AuthMethod,
  DurationBucket,
  ItemKind,
  ProductSurface,
  TelemetryErrorCode,
  TelemetryEventName,
} from "./events.ts";
import { safeMutationErrorCode } from "./errors.ts";

const operationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const authFlows = new Set<AuthFlow>(["confirmation", "login", "signup"]);
const authMethods = new Set<AuthMethod>(["email_link", "google", "password", "sms"]);
const surfaces = new Set<ProductSurface>([
  "account",
  "auth_form",
  "global_header",
  "item_editor",
  "planner",
  "planner_app_bar",
  "trip_list",
  "ideas_options",
  "research_editor",
  "route_panel",
  "variant_controls",
  "variant_comparison",
  "share_dialog",
  "public_share",
  "attachment_editor",
  "export_panel",
]);

export function newTelemetryOperationId(): string {
  return crypto.randomUUID();
}

export function telemetryOperationId(value: unknown): string | undefined {
  return typeof value === "string" && operationIdPattern.test(value) ? value : undefined;
}

export function telemetryInsertId(
  eventName: TelemetryEventName,
  operationId: unknown,
  outcome?: unknown,
  itemKind?: unknown,
  authFlow?: unknown,
): string | undefined {
  const operation = telemetryOperationId(operationId);
  if (!operation) return undefined;
  const outcomeSuffix = outcome === "failed" || outcome === "succeeded" ? `:${outcome}` : "";
  const normalizedItemKind = itemKindForTelemetry(itemKind);
  const itemSuffix = normalizedItemKind ? `:${normalizedItemKind}` : "";
  const normalizedAuthFlow = telemetryAuthFlow(authFlow);
  const authFlowSuffix = normalizedAuthFlow ? `:${normalizedAuthFlow}` : "";
  return `${eventName}${outcomeSuffix}${itemSuffix}${authFlowSuffix}:${operation}`;
}

export function telemetryAuthFlow(value: unknown): AuthFlow | undefined {
  return typeof value === "string" && authFlows.has(value as AuthFlow)
    ? (value as AuthFlow)
    : undefined;
}

export function telemetryAuthMethod(value: unknown): AuthMethod | undefined {
  return typeof value === "string" && authMethods.has(value as AuthMethod)
    ? (value as AuthMethod)
    : undefined;
}

export function telemetrySurface(value: unknown): ProductSurface | undefined {
  return typeof value === "string" && surfaces.has(value as ProductSurface)
    ? (value as ProductSurface)
    : undefined;
}

export function itemKindForTelemetry(value: unknown): ItemKind | undefined {
  if (value === "flight" || value === "train" || value === "transport") return "transport";
  if (
    value === "activity" ||
    value === "car_rental" ||
    value === "hotel" ||
    value === "meal" ||
    value === "note"
  ) {
    return value;
  }
  return undefined;
}

export function itemKindsForTelemetry(values: Iterable<unknown>): ItemKind[] {
  return [...new Set([...values].map(itemKindForTelemetry).filter((kind) => kind !== undefined))];
}

export function durationBucket(durationMilliseconds: number): DurationBucket {
  if (durationMilliseconds < 30_000) return "under_30s";
  if (durationMilliseconds < 120_000) return "30s_2m";
  if (durationMilliseconds < 300_000) return "2m_5m";
  return "over_5m";
}

export async function reportAuthoritativeMutationOutcome<Result extends object>(
  result: Result,
  reporters: {
    failed: (errorCode: TelemetryErrorCode) => void | Promise<void>;
    succeeded: () => void | Promise<void>;
  },
): Promise<Result> {
  try {
    const error = "error" in result && typeof result.error === "string" ? result.error : undefined;
    if (error) await reporters.failed(safeMutationErrorCode(error));
    else await reporters.succeeded();
  } catch {
    // The mutation result is authoritative even when telemetry delivery fails.
  }
  return result;
}

export async function reportSuccessfulSignOut<Result extends { error?: unknown }>(
  signOut: () => Promise<Result>,
  capture: () => void | Promise<void>,
): Promise<Result> {
  const result = await signOut();
  if (result.error) return result;
  try {
    await capture();
  } catch {
    // Successful authentication changes never depend on telemetry delivery.
  }
  return result;
}
