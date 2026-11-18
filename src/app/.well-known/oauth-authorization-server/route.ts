import { aiConfig, availableAiScopes } from "@/features/ai/config";
import { errorResponse, privateHeaders } from "@/features/ai/http";
import { cnMcpMigration } from "@/features/ai/regional-config";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const migration = cnMcpMigration(request, true);
    if (migration) return migration;
    const { issuer } = aiConfig();
    return Response.json(
      {
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`,
        revocation_endpoint: `${issuer}/oauth/revoke`,
        ...(process.env.MCP_DYNAMIC_REGISTRATION === "1"
          ? { registration_endpoint: `${issuer}/oauth/register` }
          : {}),
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        revocation_endpoint_auth_methods_supported: ["none"],
        scopes_supported: availableAiScopes(),
        client_id_metadata_document_supported: false,
      },
      { headers: { ...privateHeaders, "Access-Control-Allow-Origin": "*" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
