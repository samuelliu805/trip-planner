import { cnMcpMigration } from "@/features/ai/regional-config";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { aiConfig } from "@/features/ai/config";
import { privilegedAiRpc } from "@/features/ai/database.server";
import { oauthErrorResponse, privateHeaders, rateLimit } from "@/features/ai/http";
import { credentialHash } from "@/features/ai/oauth-model";
import { pendingAiCookie, validateAuthorization } from "@/features/ai/oauth-request.server";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const migration = cnMcpMigration(request);
    if (migration) return migration;
    const config = aiConfig();
    await rateLimit(privilegedAiRpc(), request, config.rateLimit, "authorize");
    const { parameters, oauth } = await validateAuthorization(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const nonce = randomBytes(32).toString("base64url");
    await oauth.store("request_save", { hash: credentialHash(nonce), parameters });
    const response = NextResponse.redirect(`${config.origin}/oauth/consent?request_id=${nonce}`, {
      headers: privateHeaders,
    });
    response.cookies.set(pendingAiCookie, nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.origin.startsWith("https:"),
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return oauthErrorResponse(error);
  }
}
