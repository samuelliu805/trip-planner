const upstreamByPath = new Map([
  ["v3/log/init", "https://restapi.amap.com"],
  ["v3/assistant/inputtips", "https://restapi.amap.com"],
  ["v3/place/around", "https://restapi.amap.com"],
  ["v3/place/detail", "https://restapi.amap.com"],
  ["v3/place/text", "https://restapi.amap.com"],
  ["v4/map/styles", "https://webapi.amap.com"],
]);

const forbiddenTargetParameters = ["host", "target", "upstream", "url"];
const maximumResponseBytes = 2 * 1024 * 1024;

type AmapSecurityProxyOptions = {
  fetchImplementation?: typeof fetch;
  securityCode: string;
  timeoutMs?: number;
};

function errorResponse(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
      status,
    },
  );
}

function fixedUpstream(request: Request, path: string, securityCode: string) {
  if (!/^[A-Za-z0-9/_-]+$/.test(path)) return null;
  const origin = upstreamByPath.get(path);
  if (!origin) return null;
  const requestUrl = new URL(request.url);
  if (
    requestUrl.searchParams.has("jscode") ||
    forbiddenTargetParameters.some((name) => requestUrl.searchParams.has(name))
  )
    return null;
  const upstream = new URL(`/${path}`, origin);
  for (const [name, value] of requestUrl.searchParams) upstream.searchParams.append(name, value);
  upstream.searchParams.set("jscode", securityCode);
  return upstream;
}

function safeContentType(value: string | null) {
  if (!value) return "application/json; charset=utf-8";
  return /^(?:application\/(?:json|javascript)|text\/(?:javascript|plain))(?:;|$)/i.test(value)
    ? value
    : "application/octet-stream";
}

export async function proxyAmapSecurityRequest(
  request: Request,
  pathSegments: string[],
  options: AmapSecurityProxyOptions,
) {
  if (request.method !== "GET") return errorResponse("Method not allowed.", 405);
  const securityCode = options.securityCode.trim();
  if (!securityCode) return errorResponse("AMap security proxy is not configured.", 503);
  const upstream = fixedUpstream(request, pathSegments.join("/"), securityCode);
  if (!upstream) return errorResponse("Not found.", 404);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  let response: Response;
  try {
    response = await (options.fetchImplementation ?? fetch)(upstream, {
      headers: {
        Accept: request.headers.get("accept") ?? "application/json",
        "Accept-Language": request.headers.get("accept-language") ?? "zh-CN,zh;q=0.9",
      },
      method: "GET",
      redirect: "error",
      signal: controller.signal,
    });
  } catch (error) {
    return errorResponse(
      controller.signal.aborted || (error instanceof Error && error.name === "AbortError")
        ? "AMap security proxy timed out."
        : "AMap security proxy is unavailable.",
      controller.signal.aborted ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok)
    return errorResponse("AMap upstream request failed.", response.status === 429 ? 429 : 502);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes)
    return errorResponse("AMap upstream response was too large.", 502);
  const body = await response.arrayBuffer();
  if (
    body.byteLength > maximumResponseBytes ||
    new TextDecoder().decode(body).includes(securityCode)
  )
    return errorResponse("AMap upstream response was rejected.", 502);
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": safeContentType(response.headers.get("content-type")),
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}
