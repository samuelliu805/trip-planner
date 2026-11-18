import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { regionalConfig } from "@/features/ai/regional-config";
import { regionalFetch } from "@/features/ai/regional-auth";
import { browserAiRpc, privilegedAiRpc } from "@/features/ai/database.server";
import { credentialHash } from "@/features/ai/oauth-model";
import { AiError, callRpc } from "@/features/ai/service";
import { errorResponse } from "@/features/ai/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const config = regionalConfig();
    if (process.env.MCP_REGIONAL_GATEWAY_ENABLED !== "1")
      throw new AiError("AUTHORIZATION_EXPIRED");
    const { searchParams } = new URL(request.url),
      cookie = (await cookies()).get("trip_ai_region_binding")?.value;
    const state = searchParams.get("state") ?? "",
      code = searchParams.get("code") ?? "";
    const [connection_id, savedState] = cookie?.split(".") ?? [];
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !/^[A-Za-z0-9_-]{43}$/.test(code) ||
      savedState !== state
    )
      throw new AiError("AUTHORIZATION_EXPIRED");
    const input = { connection_id, state_hash: credentialHash(state) };
    // Session-backed ownership and browser-bound state are both mandatory.
    await callRpc(await browserAiRpc(), "ai_gateway_manage_v1", { action: "pending", input });
    const grant = await regionalFetch(config, "gateway", "cn", {
      action: "exchange",
      ...input,
      code_hash: credentialHash(code),
    });
    await callRpc(privilegedAiRpc(), "ai_gateway_service_v1", {
      action: "bind",
      input: { ...input, grant },
    });
    const response = NextResponse.redirect(`${config.gatewayOrigin}/account/ai`);
    response.cookies.delete("trip_ai_region_binding");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
