export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return "http://localhost:3000";
  try {
    return new URL(configured).origin;
  } catch {
    return "http://localhost:3000";
  }
}

type HeaderReader = Pick<Headers, "get">;

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

function validOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function siteUrlFromHeaders(requestHeaders: HeaderReader, fallback = getSiteUrl()) {
  const requestOrigin = validOrigin(firstHeaderValue(requestHeaders.get("origin")));
  if (requestOrigin) return requestOrigin;

  return forwardedOrigin(requestHeaders, fallback);
}

function forwardedOrigin(requestHeaders: HeaderReader, fallback: string) {
  const host = firstHeaderValue(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
  if (!host) return fallback;
  const forwardedProtocol = firstHeaderValue(requestHeaders.get("x-forwarded-proto"));
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : /^(localhost|127\.0\.0\.1)(:|$)/.test(host)
        ? "http"
        : "https";
  return validOrigin(`${protocol}://${host}`) ?? fallback;
}

export function isSameOriginRequest(requestHeaders: HeaderReader, fallback = getSiteUrl()) {
  const requestOrigin = validOrigin(firstHeaderValue(requestHeaders.get("origin")));
  return Boolean(requestOrigin && requestOrigin === forwardedOrigin(requestHeaders, fallback));
}
