import type { Json } from "@/types/database";
import { isToolName, parseToolInput } from "./schemas";
import type { PlacesToolName } from "./place-schemas";
import { scheduleErrorIssues, type FieldIssue } from "./input-errors";

export type AiAuthorization = { hash: string; resource: string; issuer: string };
export type PlacesToolRunner = (
  tool: PlacesToolName,
  input: Record<string, unknown>,
  authorization: AiAuthorization,
) => Promise<Json>;

export type Rpc = (
  name: string,
  parameters: Record<string, unknown>,
) => Promise<{
  data: unknown;
  error: { code?: string; message: string; details?: string } | null;
}>;
export const knownCodes = [
  "REGION_AUTHORIZATION_REQUIRED",
  "REGION_SELECTION_REQUIRED",
  "REGION_UNAVAILABLE",
  "CROSS_REGION_OPERATION",
  "CURSOR_INVALID",
  "INVALID_RESOURCE_HANDLE",
  "INVALID_INPUT",
  "AUTHORIZATION_EXPIRED",
  "INVALID_SERVICE_IDENTITY",
  "INVALID_TOKEN",
  "AUTHENTICATION_REQUIRED",
  "INSUFFICIENT_SCOPE",
  "RESOURCE_FORBIDDEN",
  "IDEA_FORBIDDEN",
  "ALL_TRIPS_GRANT_REQUIRED",
  "REVISION_CONFLICT",
  "UNDO_CONFLICT",
  "PREVIEW_INVALID",
  "IDEMPOTENCY_MISMATCH",
  "BATCH_LIMIT_EXCEEDED",
  "CHANGE_ALREADY_UNDONE",
  "COMPOUND_ITEM_REQUIRES_WEB_EDITOR",
  "LINKED_ITEM_REQUIRES_WEB_EDITOR",
  "PLACE_LOOKUP_EXPIRED",
  "PLACE_NOT_IN_SEARCH",
  "PLACE_LOOKUP_PENDING",
  "PLACE_RATE_LIMITED",
  "PLACE_QUOTA_EXCEEDED",
  "PLACE_RESOLUTION_REQUIRED",
  "PLACE_SELECTION_MISMATCH",
  "PLACE_PROVIDER_UNAVAILABLE",
];
export class AiError extends Error {
  constructor(
    public code: string,
    message = code,
    public issues?: FieldIssue[],
  ) {
    super(message);
  }
}
function normalizeRevisions(value: Json): Json {
  if (Array.isArray(value)) return value.map(normalizeRevisions);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "revision" && typeof item === "number"
          ? String(item)
          : normalizeRevisions(item ?? null),
      ]),
    );
  return value;
}
export async function callRpc(rpc: Rpc, name: string, args: Record<string, unknown>) {
  const { data, error } = await rpc(name, args);
  if (error) {
    const code =
      knownCodes.find((value) => error.message.includes(value)) ??
      (error.code === "PT409" || error.code === "40001" || error.code === "40P01"
        ? "REVISION_CONFLICT"
        : error.code === "42501"
          ? "RESOURCE_FORBIDDEN"
          : error.code?.startsWith("22") || error.code?.startsWith("23")
            ? "INVALID_INPUT"
            : "SERVICE_UNAVAILABLE");
    const issues = code === "INVALID_INPUT" ? scheduleErrorIssues(error.details) : undefined;
    throw new AiError(code, issues?.[0]?.message ?? code, issues);
  }
  return normalizeRevisions(data as Json);
}
export async function invokeTool(
  rpc: Rpc,
  tool: string,
  input: unknown,
  authorization?: AiAuthorization,
  places?: PlacesToolRunner,
) {
  if (!isToolName(tool)) throw new AiError("UNKNOWN_TOOL");
  const args = parseToolInput(tool, input);
  if (tool === "place_search" || tool === "place_resolve") {
    if (!authorization) throw new AiError("INSUFFICIENT_SCOPE");
    if (!places) throw new AiError("PLACE_PROVIDER_UNAVAILABLE");
    return places(tool, args, authorization);
  }
  return callRpc(
    rpc,
    authorization ? "ai_invoke_v1" : "ai_web_invoke_v1",
    authorization
      ? {
          access_hash: authorization.hash,
          expected_resource: authorization.resource,
          expected_issuer: authorization.issuer,
          tool,
          args,
        }
      : { tool, args },
  );
}
