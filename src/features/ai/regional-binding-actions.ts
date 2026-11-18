"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { browserAiRpc } from "./database.server";
import { credentialHash } from "./oauth-model";
import { regionalConfig } from "./regional-config";
import { regionalFetch } from "./regional-auth";
import { AiError, callRpc } from "./service";
import { aiScopes } from "./config";

export async function bindCnRegion(form: FormData) {
  const config = regionalConfig();
  if (
    process.env.MCP_REGIONAL_GATEWAY_ENABLED !== "1" ||
    (await headers()).get("origin") !== config.gatewayOrigin
  )
    throw new AiError("INVALID_ORIGIN");
  const connection_id = z.uuid().parse(form.get("connection_id"));
  const state = randomBytes(32).toString("base64url");
  await callRpc(await browserAiRpc(), "ai_gateway_manage_v1", {
    action: "start",
    input: { connection_id, state_hash: credentialHash(state) },
  });
  (await cookies()).set("trip_ai_region_binding", `${connection_id}.${state}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  redirect(`${config.cnOrigin}/account/ai/region?state=${state}`);
}

export async function manageRegion(form: FormData) {
  const config = regionalConfig();
  if (
    process.env.MCP_REGIONAL_GATEWAY_ENABLED !== "1" ||
    (await headers()).get("origin") !== config.gatewayOrigin
  )
    throw new AiError("INVALID_ORIGIN");
  await callRpc(await browserAiRpc(), "ai_gateway_manage_v1", {
    action: z.enum(["default", "unbind"]).parse(form.get("action")),
    input: {
      connection_id: z.uuid().parse(form.get("connection_id")),
      region: z
        .enum(["global", "cn"])
        .nullable()
        .parse(form.get("region") || null),
    },
  });
  revalidatePath("/account/ai");
}

export async function authorizeCnRegion(form: FormData) {
  const config = regionalConfig();
  if (
    process.env.APP_REGION !== "cn" ||
    process.env.MCP_REGIONAL_API_ENABLED !== "1" ||
    (await headers()).get("origin") !== config.cnOrigin
  )
    throw new AiError("INVALID_ORIGIN");
  const state = z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .parse(form.get("state"));
  const pending = (await regionalFetch(config, "cn", "gateway", {
    action: "binding",
    state_hash: credentialHash(state),
  })) as { connection_id: string; scopes: string[] };
  const scopes = z.array(z.enum(aiScopes)).min(1).parse(form.getAll("scopes"));
  if (scopes.some((scope) => !pending.scopes.includes(scope)))
    throw new AiError("INSUFFICIENT_SCOPE");
  const code = randomBytes(32).toString("base64url");
  await callRpc(await browserAiRpc(), "ai_regional_grant_v1", {
    input: {
      connection_id: pending.connection_id,
      state_hash: credentialHash(state),
      code_hash: credentialHash(code),
      scopes,
      trip_ids: z.array(z.uuid()).max(50).parse(form.getAll("trip_ids")),
      all_trips: form.get("all_trips") === "on",
      issuer: config.issuer,
      resource: config.resource,
    },
  });
  (await cookies()).delete("trip_ai_region_login");
  redirect(`${config.gatewayOrigin}/api/ai/region/callback?state=${state}&code=${code}`);
}
