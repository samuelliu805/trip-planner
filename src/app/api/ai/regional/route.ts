import { privilegedAiRpc } from "@/features/ai/database.server";
import { regionalConfig } from "@/features/ai/regional-config";
import { handleRegionalApi } from "@/features/ai/regional-endpoint";
import { configuredPlacesRunner } from "@/features/ai/places.server";
import { aiConfig } from "@/features/ai/config";
import { errorResponse } from "@/features/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const region = process.env.APP_REGION === "cn" ? "cn" : "global";
    if (
      process.env[region === "cn" ? "MCP_REGIONAL_API_ENABLED" : "MCP_REGIONAL_GATEWAY_ENABLED"] !==
      "1"
    )
      return Response.json({ error: "REGIONAL_API_DISABLED" }, { status: 503 });
    const config = regionalConfig(),
      rpc = privilegedAiRpc();
    return await handleRegionalApi(
      request,
      rpc,
      config,
      region,
      region === "cn" ? configuredPlacesRunner(rpc, aiConfig({ regional: true })) : undefined,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
