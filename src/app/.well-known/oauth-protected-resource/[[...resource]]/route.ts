import { aiConfig, availableAiScopes } from "@/features/ai/config";
import { cnMcpMigration } from "@/features/ai/regional-config";
import { errorResponse, privateHeaders } from "@/features/ai/http";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ resource?: string[] }> },
) {
  try {
    const migration = cnMcpMigration(_request, true);
    if (migration) return migration;
    const parts = (await context.params).resource;
    if (parts?.join("/") && parts.join("/") !== "mcp") return new Response(null, { status: 404 });
    const { resource, issuer } = aiConfig();
    return Response.json(
      {
        resource,
        authorization_servers: [issuer],
        scopes_supported: availableAiScopes(),
        bearer_methods_supported: ["header"],
        resource_name: "Trip Planner",
      },
      { headers: { ...privateHeaders, "Access-Control-Allow-Origin": "*" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
