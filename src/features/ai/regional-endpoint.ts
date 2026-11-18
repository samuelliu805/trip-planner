import { z } from "zod";
import { boundedBody, errorResponse, privateHeaders } from "./http";
import { credentialHash } from "./oauth-model";
import { AiError, callRpc, invokeTool, type PlacesToolRunner, type Rpc } from "./service";
import { regionalFetch, verifyRegional } from "./regional-auth";
import { gatewayContext, type GatewayContext } from "./regional-gateway";
import type { RegionalConfig } from "./regional-config";

const identity = { connection_id: z.uuid(), grant_id: z.uuid() };
const authorization = z
  .object({ hash: z.string().regex(/^[a-f0-9]{64}$/), issuer: z.url(), resource: z.url() })
  .strict();
const envelope = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("binding"), state_hash: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict(),
  z
    .object({
      action: z.literal("exchange"),
      connection_id: z.uuid(),
      code_hash: z.string().regex(/^[a-f0-9]{64}$/),
      state_hash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("invoke"),
      ...identity,
      authorization,
      tool: z.string(),
      args: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z.object({ action: z.literal("introspect"), ...identity, authorization }).strict(),
]);

export async function handleRegionalApi(
  request: Request,
  rpc: Rpc,
  config: RegionalConfig,
  region: "global" | "cn",
  places?: PlacesToolRunner,
) {
  try {
    const source = await boundedBody(request);
    const token = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token) throw new AiError("INVALID_SERVICE_IDENTITY");
    const claims = await verifyRegional(
      config,
      region === "cn" ? "gateway" : "cn",
      region === "cn" ? "cn" : "gateway",
      "api",
      token,
    );
    if (claims.digest !== credentialHash(source)) throw new AiError("INVALID_SERVICE_IDENTITY");
    const body = envelope.parse(JSON.parse(source));
    if (region === "global") {
      if (body.action === "binding")
        return Response.json(
          await callRpc(rpc, "ai_gateway_service_v1", {
            action: "binding_get",
            input: body,
          }),
          { headers: privateHeaders },
        );
      if (body.action !== "introspect") throw new AiError("INVALID_SERVICE_IDENTITY");
      const context = await gatewayContext(rpc, body.authorization);
      const grant = context.regions.find(
        (grant) => grant.region === "cn" && grant.grant_id === body.grant_id,
      );
      if (context.connection_id !== body.connection_id || !grant)
        throw new AiError("REGION_AUTHORIZATION_REQUIRED");
      return Response.json({ grant }, { headers: privateHeaders });
    }
    if (body.action === "exchange") {
      const grant = await callRpc(rpc, "ai_regional_service_v1", {
        action: "exchange",
        input: body,
      });
      return Response.json(grant, { headers: privateHeaders });
    }
    if (
      body.action !== "invoke" ||
      body.authorization.issuer !== config.issuer ||
      body.authorization.resource !== config.resource
    )
      throw new AiError("INVALID_SERVICE_IDENTITY");
    // The regional API checks central revocation afresh; no positive introspection cache.
    const { grant } = (await regionalFetch(config, "cn", "gateway", {
      action: "introspect",
      connection_id: body.connection_id,
      grant_id: body.grant_id,
      authorization: body.authorization,
    })) as { grant: GatewayContext["regions"][number] };
    const hash = credentialHash(token);
    await callRpc(rpc, "ai_regional_service_v1", {
      action: "credential",
      input: {
        connection_id: body.connection_id,
        grant_id: body.grant_id,
        hash,
        scopes: grant.scopes,
      },
    });
    const result = await invokeTool(
      rpc,
      body.tool,
      body.args,
      { hash, issuer: config.issuer, resource: config.resource },
      places,
    );
    return Response.json(result, { headers: privateHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
