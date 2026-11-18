import { cnMcpMigration } from "@/features/ai/regional-config";
import { aiConfig } from "@/features/ai/config";
import { privilegedAiRpc } from "@/features/ai/database.server";
import { boundedBody, oauthErrorResponse, privateHeaders, rateLimit } from "@/features/ai/http";
import { credentialHash, oauthModel } from "@/features/ai/oauth-model";
import { AiError } from "@/features/ai/service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const migration = cnMcpMigration(request);
    if (migration) return migration;
    const config = aiConfig();
    const rpc = privilegedAiRpc();
    await rateLimit(rpc, request, config.rateLimit, "revoke");
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
      throw new AiError("INVALID_REQUEST");
    const body = new URLSearchParams(await boundedBody(request, 16384));
    await oauthModel(rpc, config).store("revoke", {
      hash: credentialHash(body.get("token") ?? ""),
      client_id: body.get("client_id"),
    });
    return new Response(null, { status: 200, headers: privateHeaders });
  } catch (error) {
    return oauthErrorResponse(error);
  }
}
