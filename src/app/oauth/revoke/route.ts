import { aiConfig } from "@/features/ai/config";
import { privilegedAiRpc } from "@/features/ai/database.server";
import { boundedBody, errorResponse, privateHeaders, rateLimit } from "@/features/ai/http";
import { credentialHash, oauthModel } from "@/features/ai/oauth-model";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const config = aiConfig();
    const rpc = privilegedAiRpc();
    await rateLimit(rpc, request, config.rateLimit, "revoke");
    const body = new URLSearchParams(await boundedBody(request, 16384));
    await oauthModel(rpc, config).store("revoke", {
      hash: credentialHash(body.get("token") ?? ""),
      client_id: body.get("client_id"),
    });
    return new Response(null, { status: 200, headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
