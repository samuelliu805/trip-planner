import { RouteProviderError, type RouteProviderErrorCode } from "../../routes/errors.ts";

const amapRouteMessages: Record<RouteProviderErrorCode, string> = {
  authentication: "AMap Routes rejected the Web Service API key. Check that the key is valid.",
  invalid_request:
    "AMap Routes rejected the route request. Check the saved places and travel modes; the previous route is unchanged.",
  invalid_response: "AMap Routes returned an invalid response. The previous route is unchanged.",
  missing_key: "AMap Routes is not configured on the server.",
  network:
    "The server could not reach AMap Routes. Check outbound HTTPS; the previous route is unchanged.",
  permission: "AMap Routes is not enabled or permitted for the Web Service API key.",
  provider_unavailable: "AMap Routes is temporarily unavailable. Try calculating again later.",
  quota: "AMap Routes quota or rate limit was reached. Check quotas before trying again.",
  timeout: "AMap Routes timed out. The previous route is unchanged; try again later.",
};

export function amapRouteProviderError(code: RouteProviderErrorCode, cause?: unknown) {
  return new RouteProviderError(code, amapRouteMessages[code], { cause });
}
