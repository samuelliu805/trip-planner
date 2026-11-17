import OAuth2Server from "@node-oauth/oauth2-server";
import { aiConfig } from "@/features/ai/config";
import { privilegedAiRpc } from "@/features/ai/database.server";
import { boundedBody, oauthErrorResponse, privateHeaders, rateLimit } from "@/features/ai/http";
import { oauthModel } from "@/features/ai/oauth-model";
import { ensurePreregistered } from "@/features/ai/oauth-registration";
import { AiError } from "@/features/ai/service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const config = aiConfig();
    const rpc = privilegedAiRpc();
    await rateLimit(rpc, request, config.rateLimit, "token");
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
      throw new AiError("INVALID_REQUEST");
    const body = Object.fromEntries(new URLSearchParams(await boundedBody(request, 16384)));
    if (body.resource && body.resource !== config.resource)
      return Response.json({ error: "invalid_target" }, { status: 400, headers: privateHeaders });
    if (!["authorization_code", "refresh_token"].includes(body.grant_type))
      throw new AiError("UNSUPPORTED_GRANT_TYPE");
    const oauth = oauthModel(rpc, config);
    await ensurePreregistered(oauth, body.client_id);
    const response = new OAuth2Server.Response();
    try {
      await oauth.server.token(
        new OAuth2Server.Request({
          method: "POST",
          query: {},
          body,
          headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "1" },
        }),
        response,
        {
          requirePKCE: true,
          requireClientAuthentication: { authorization_code: false, refresh_token: false },
        },
      );
      return Response.json(response.body, {
        status: response.status,
        headers: { ...privateHeaders, "Access-Control-Allow-Origin": "*" },
      });
    } catch (error) {
      const code = error instanceof OAuth2Server.OAuthError ? error.name : "server_error";
      return Response.json(
        {
          error: code,
          error_description: "Authorization failed. Reconnect your client if necessary.",
        },
        { status: 400, headers: privateHeaders },
      );
    }
  } catch (error) {
    return oauthErrorResponse(error);
  }
}
