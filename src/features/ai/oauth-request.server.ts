import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { aiConfig, availableAiScopes } from "./config";
import { privilegedAiRpc } from "./database.server";
import { credentialHash, oauthModel } from "./oauth-model";
import { ensurePreregistered } from "./oauth-registration";
import { AiError } from "./service";

export const pendingAiCookie = "trip_ai_authorization";
export const authorizationSchema = z
  .object({
    client_id: z.string().min(1).max(256),
    redirect_uri: z.url().max(2000),
    response_type: z.literal("code"),
    state: z.string().min(1).max(2000),
    scope: z
      .string()
      .min(1)
      .max(200)
      .default(() => availableAiScopes().join(" ")),
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code_challenge_method: z.literal("S256"),
    resource: z.string().optional(),
  })
  .strip();

export async function validateAuthorization(input: unknown) {
  const parameters = authorizationSchema.parse(input);
  const config = aiConfig();
  if (parameters.resource && parameters.resource !== config.resource)
    throw new AiError("INVALID_RESOURCE");
  const scopes = [...new Set(parameters.scope.split(" "))];
  if (!scopes.every((scope) => (availableAiScopes() as readonly string[]).includes(scope)))
    throw new AiError("INVALID_SCOPE");
  const oauth = oauthModel(privilegedAiRpc(), config);
  await ensurePreregistered(oauth, parameters.client_id);
  const client = await oauth.model.getClient(parameters.client_id, undefined);
  if (!client || !client.redirectUris?.includes(parameters.redirect_uri))
    throw new AiError("INVALID_REDIRECT_URI");
  return {
    parameters: { ...parameters, resource: config.resource, scope: scopes.join(" ") },
    oauth,
    config,
  };
}
export async function loadAuthorization(nonce: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce) || (await cookies()).get(pendingAiCookie)?.value !== nonce)
    throw new AiError("AUTHORIZATION_EXPIRED");
  const config = aiConfig();
  const oauth = oauthModel(privilegedAiRpc(), config);
  const parameters = await oauth.store("request_get", { hash: credentialHash(nonce) });
  if (!parameters) throw new AiError("AUTHORIZATION_EXPIRED");
  return validateAuthorization(parameters);
}
