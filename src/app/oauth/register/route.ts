import { aiConfig } from "@/features/ai/config";
import { privilegedAiRpc } from "@/features/ai/database.server";
import { boundedBody, errorResponse, privateHeaders, rateLimit } from "@/features/ai/http";
import { oauthModel } from "@/features/ai/oauth-model";
import { registerClient } from "@/features/ai/oauth-registration";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const config = aiConfig();
    if (process.env.MCP_DYNAMIC_REGISTRATION !== "1") return new Response(null, { status: 404 });
    const rpc = privilegedAiRpc();
    await rateLimit(rpc, request, 10, "register");
    const client = await registerClient(
      oauthModel(rpc, config),
      JSON.parse(await boundedBody(request, 16384)),
    );
    return Response.json(client, { status: 201, headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
