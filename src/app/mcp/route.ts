import { aiConfig } from "@/features/ai/config";
import { privilegedAiRpc } from "@/features/ai/database.server";
import { errorResponse } from "@/features/ai/http";
import { handleMcp } from "@/features/ai/mcp";
import { configuredPlacesRunner } from "@/features/ai/places.server";
import { cnMcpMigration, regionalConfig } from "@/features/ai/regional-config";
import { createRegionalGateway } from "@/features/ai/regional-gateway";
import { regionalFetch } from "@/features/ai/regional-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const migration = cnMcpMigration(request);
    if (migration) return migration;
    const config = aiConfig();
    const rpc = privilegedAiRpc();
    const places = configuredPlacesRunner(rpc, config);
    const regional = process.env.MCP_REGIONAL_GATEWAY_ENABLED === "1" ? regionalConfig() : null;
    if (regional && (regional.issuer !== config.issuer || regional.resource !== config.resource))
      throw new Error("INVALID_MCP_ORIGIN");
    const runner = regional
      ? createRegionalGateway(
          rpc,
          regional.originFor,
          (tool, args, authorization, context, grant) =>
            regionalFetch(regional, "gateway", "cn", {
              action: "invoke",
              tool,
              args,
              authorization,
              connection_id: context.connection_id,
              grant_id: grant.grant_id,
            }),
          places,
          config.rateLimit,
        )
      : undefined;
    return await handleMcp(request, rpc, config, places, runner);
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = POST;
export const DELETE = POST;
export const OPTIONS = POST;
