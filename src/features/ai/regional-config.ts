import type { DataRegion } from "./regional-handles";
import { AiError } from "./service";

function origin(value: string | undefined) {
  const url = new URL(value ?? "");
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new AiError("REGIONAL_CONFIGURATION_REQUIRED");
  return url.origin;
}

export function regionalConfig() {
  const gatewayOrigin = origin(process.env.MCP_GATEWAY_ORIGIN);
  const cnOrigin = origin(process.env.MCP_CN_API_ORIGIN);
  return {
    gatewayOrigin,
    cnOrigin,
    issuer: gatewayOrigin,
    resource: `${gatewayOrigin}/mcp`,
    originFor: (region: DataRegion) => (region === "cn" ? cnOrigin : gatewayOrigin),
    privateJwk: process.env.MCP_SERVICE_PRIVATE_JWK ?? "",
    peerPublicJwk: process.env.MCP_SERVICE_PEER_PUBLIC_JWK ?? "",
  };
}

export type RegionalConfig = ReturnType<typeof regionalConfig>;

export function cnMcpMigration(request: Request, discovery = false) {
  if (process.env.APP_REGION !== "cn" || !process.env.MCP_GATEWAY_ORIGIN) return null;
  const target = origin(process.env.MCP_GATEWAY_ORIGIN);
  const path = new URL(request.url).pathname;
  if (discovery)
    return new Response(null, {
      status: 307,
      headers: {
        Location: `${target}${path}`,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  return Response.json(
    {
      error: "MCP_MOVED",
      resource: `${target}/mcp`,
      message: "Use the unified MCP address. Bind your CN account in website connection settings.",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store", Link: `<${target}/mcp>; rel="successor-version"` },
    },
  );
}
