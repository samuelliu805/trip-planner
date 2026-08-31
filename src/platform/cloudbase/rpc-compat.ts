import { PlatformOperationError } from "../contracts/errors.ts";

import { isCloudBaseScalarUuidParseError, normalizeCloudBaseError } from "./errors.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function scalar(value: unknown): unknown {
  if (Array.isArray(value)) return scalar(value[0]);
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return row.id ?? row.value ?? value;
  }
  return value;
}

function uuid(value: unknown) {
  const candidate = scalar(value);
  if (typeof candidate === "string" && uuidPattern.test(candidate)) return candidate;
  throw new PlatformOperationError("unexpected", "The database returned an invalid identifier.");
}

/** Central SDK 3.9 workaround: a scalar UUID RPC commits before its JSON parser fails. */
export async function cloudBaseScalarUuidRpc(input: {
  execute(): Promise<{ data: unknown; error: unknown }>;
  recover(): Promise<unknown>;
  safeMessage: string;
}) {
  const result = await input.execute();
  if (!result.error) return uuid(result.data);
  if (!isCloudBaseScalarUuidParseError(result.error)) {
    throw normalizeCloudBaseError(result.error, input.safeMessage);
  }
  return uuid(await input.recover());
}
