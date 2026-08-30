export type RouteProviderErrorCode =
  | "missing_key"
  | "authentication"
  | "permission"
  | "quota"
  | "timeout"
  | "network"
  | "invalid_request"
  | "provider_unavailable"
  | "invalid_response";

export class RouteProviderError extends Error {
  readonly code: RouteProviderErrorCode;

  constructor(code: RouteProviderErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = "RouteProviderError";
  }
}
