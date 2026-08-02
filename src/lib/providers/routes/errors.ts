export type RouteProviderErrorCode =
  | "missing_key"
  | "authentication"
  | "permission"
  | "quota"
  | "timeout"
  | "provider_unavailable"
  | "invalid_response";

const safeMessages: Record<RouteProviderErrorCode, string> = {
  authentication: "Google Routes rejected the server API key. Check that the key is valid.",
  invalid_response: "Google Routes returned an invalid response. The previous route is unchanged.",
  missing_key:
    "Google Routes is not configured. Add GOOGLE_ROUTES_API_KEY to the server environment.",
  permission: "Google Routes is not enabled or permitted for the server API key.",
  provider_unavailable: "Google Routes is temporarily unavailable. Try calculating again later.",
  quota: "Google Routes quota or rate limit was reached. Check quotas before trying again.",
  timeout:
    "Google Routes timed out. The previous route is unchanged; try again when service is stable.",
};

export class RouteProviderError extends Error {
  readonly code: RouteProviderErrorCode;

  constructor(code: RouteProviderErrorCode, options?: { cause?: unknown }) {
    super(safeMessages[code], options);
    this.code = code;
    this.name = "RouteProviderError";
  }
}
