import { aiConfig, availableAiScopes } from "@/features/ai/config";
import { errorResponse, privateHeaders } from "@/features/ai/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ resource?: string[] }> },
) {
  try {
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
