"use server";

import OAuth2Server from "@node-oauth/oauth2-server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthProvider } from "@/platform/composition/server";
import { credentialHash } from "./oauth-model";
import { loadAuthorization, pendingAiCookie } from "./oauth-request.server";

export async function completeAuthorization(form: FormData) {
  const nonce = String(form.get("request_id") ?? "");
  const { parameters, config, oauth } = await loadAuthorization(nonce);
  if ((await headers()).get("origin") !== config.origin) throw new Error("INVALID_ORIGIN");
  const user = await getAuthProvider().getCurrentUser();
  if (!user) redirect("/login");
  const allowed = form.get("decision") === "allow";
  const approved = z
    .array(z.string())
    .min(allowed ? 1 : 0)
    .max(4)
    .parse(form.getAll("scopes"));
  if (approved.some((scope) => !parameters.scope.split(" ").includes(scope)))
    throw new Error("INVALID_SCOPE");
  const tripIds = z.array(z.uuid()).max(50).parse(form.getAll("trip_ids"));
  const consumed = await oauth.store("request_consume", { hash: credentialHash(nonce) });
  if (!consumed) throw new Error("AUTHORIZATION_EXPIRED");
  (await cookies()).delete(pendingAiCookie);
  const response = new OAuth2Server.Response();
  try {
    await oauth.server.authorize(
      new OAuth2Server.Request({
        method: "POST",
        headers: {},
        query: { ...parameters, scope: allowed ? approved.join(" ") : parameters.scope },
        body: { allowed: String(allowed) },
      }),
      response,
      {
        requirePKCE: true,
        authenticateHandler: {
          handle: async () => ({
            id: user.id,
            approved_scopes: approved,
            trip_ids: tripIds,
            all_trips: form.get("all_trips") === "on",
          }),
        },
      },
    );
  } catch {
    if (!response.headers?.location) throw new Error("AUTHORIZATION_FAILED");
  }
  revalidatePath("/account/ai");
  redirect(String(response.headers?.location));
}
