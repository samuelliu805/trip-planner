import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AiError } from "./service";
import type { oauthModel } from "./oauth-model";

export const registrationSchema = z
  .object({
    client_name: z.string().trim().min(1).max(100).default("AI client"),
    redirect_uris: z
      .array(
        z
          .url()
          .max(2000)
          .refine((value) => {
            const url = new URL(value);
            return (
              !url.username &&
              !url.password &&
              !url.hash &&
              (url.protocol === "https:" ||
                (url.protocol === "http:" &&
                  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
            );
          }),
      )
      .min(1)
      .max(5),
    token_endpoint_auth_method: z.literal("none").default("none"),
    grant_types: z
      .array(z.enum(["authorization_code", "refresh_token"]))
      .max(2)
      .optional(),
    response_types: z.array(z.literal("code")).max(1).optional(),
  })
  .strip();

export async function registerClient(
  oauth: ReturnType<typeof oauthModel>,
  input: unknown,
  id: string = randomUUID(),
) {
  const metadata = registrationSchema.parse(input);
  await oauth.store("client_save", { id, metadata });
  return {
    ...metadata,
    client_id: id,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}
export async function ensurePreregistered(oauth: ReturnType<typeof oauthModel>, id: string) {
  if (await oauth.model.getClient(id, undefined)) return;
  const clients = z
    .array(registrationSchema.extend({ client_id: z.string().min(1).max(256) }))
    .max(20)
    .parse(JSON.parse(process.env.MCP_CLIENTS_JSON ?? "[]"));
  const configured = clients.find((client) => client.client_id === id);
  if (!configured) throw new AiError("INVALID_CLIENT");
  try {
    await registerClient(oauth, configured, id);
  } catch {
    if (!(await oauth.model.getClient(id, undefined))) throw new AiError("INVALID_CLIENT");
  }
}
