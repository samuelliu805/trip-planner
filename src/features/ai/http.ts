import { AiError, callRpc, type Rpc } from "./service";
import { credentialHash } from "./oauth-model";

export const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export async function boundedBody(request: Pick<Request, "body" | "headers">, max = 131072) {
  if (Number(request.headers.get("content-length")) > max) throw new AiError("REQUEST_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) return "";
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) {
        await reader.cancel();
        throw new AiError("REQUEST_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function rateLimit(rpc: Rpc, request: Request, limit: number, route: string) {
  // Deployment ingress must overwrite X-Forwarded-For. Also enforce per-connection
  // limits; this ingress bucket is defense in depth for invalid/unauthenticated traffic.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await callRpc(rpc, "ai_oauth_store_v1", {
    action: "rate",
    input: {
      key: credentialHash(`${route}:${ip}`),
      limit,
    },
  });
  if (!allowed) throw new AiError("RATE_LIMITED", "Too many calls. Try again in one minute.");
}
export function errorResponse(error: unknown) {
  const code =
    error instanceof AiError
      ? error.code
      : error instanceof Error && error.message === "MCP_DISABLED"
        ? "MCP_DISABLED"
        : "INVALID_REQUEST";
  const status =
    code === "RATE_LIMITED"
      ? 429
      : code === "REQUEST_TOO_LARGE"
        ? 413
        : code === "MCP_DISABLED" || code === "SERVICE_UNAVAILABLE" || code === "REGION_UNAVAILABLE"
          ? 503
          : code === "INVALID_TOKEN" || code === "INVALID_SERVICE_IDENTITY"
            ? 401
            : 400;
  return Response.json(
    {
      error: code,
      message: code === "RATE_LIMITED" ? "Too many calls. Try again in one minute." : code,
      ...(error instanceof AiError && error.issues ? { issues: error.issues } : {}),
    },
    { status, headers: { ...privateHeaders, ...(status === 429 ? { "Retry-After": "60" } : {}) } },
  );
}

/** OAuth endpoints use RFC error identifiers; business tool codes remain uppercase. */
export function oauthErrorResponse(error: unknown, fallback = "invalid_request") {
  const response = errorResponse(error);
  const codes: Record<string, string> = {
    INVALID_CLIENT: "invalid_client",
    INVALID_SCOPE: "invalid_scope",
    INVALID_RESOURCE: "invalid_target",
    INVALID_REDIRECT_URI: "invalid_redirect_uri",
    UNSUPPORTED_GRANT_TYPE: "unsupported_grant_type",
    RATE_LIMITED: "temporarily_unavailable",
    SERVICE_UNAVAILABLE: "temporarily_unavailable",
  };
  const code = error instanceof AiError ? (codes[error.code] ?? fallback) : fallback;
  return Response.json(
    { error: code, error_description: "The authorization request could not be completed." },
    { status: response.status, headers: response.headers },
  );
}
