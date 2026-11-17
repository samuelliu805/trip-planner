import type { Json } from "@/types/database";
import { isToolName, parseToolInput } from "./schemas";

export type Rpc = (
  name: string,
  parameters: Record<string, unknown>,
) => Promise<{
  data: unknown;
  error: { code?: string; message: string } | null;
}>;
const knownCodes = [
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
];
export class AiError extends Error {
  constructor(
    public code: string,
    message = code,
  ) {
    super(message);
  }
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
    throw new AiError(code);
  }
  return data as Json;
}
export async function invokeTool(
  rpc: Rpc,
  tool: string,
  input: unknown,
  authorization?: {
    hash: string;
    resource: string;
    issuer: string;
  },
) {
  if (!isToolName(tool)) throw new AiError("UNKNOWN_TOOL");
  const args = parseToolInput(tool, input);
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
