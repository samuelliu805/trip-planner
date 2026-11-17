import { createHash } from "node:crypto";
import OAuth2Server from "@node-oauth/oauth2-server";
import { aiScopes } from "./config";
import { AiError, callRpc, type Rpc } from "./service";

export const credentialHash = (value: string) => createHash("sha256").update(value).digest("hex");
type Stored = Record<string, unknown> & {
  connection_id: string;
  user_key: string;
  client_id: string;
  scopes: string[];
};
export function oauthModel(rpc: Rpc, config: { resource: string; issuer: string }) {
  const store = (action: string, input: Record<string, unknown>) =>
    callRpc(rpc, "ai_oauth_store_v1", { action, input });
  async function get(kind: string, token: string) {
    return (await store(`${kind}_get`, {
      hash: credentialHash(token),
      ...config,
    })) as Stored | null;
  }
  const user = (data: Stored) => ({ id: data.user_key, connection_id: data.connection_id });
  const client = (data: Stored) => ({
    id: data.client_id,
    grants: ["authorization_code", "refresh_token"],
  });
  const model: OAuth2Server.AuthorizationCodeModel & OAuth2Server.RefreshTokenModel = {
    async getClient(id, secret) {
      if (secret) return false;
      const metadata = (await store("client_get", { id })) as {
        id: string;
        redirect_uris: string[];
      } | null;
      if (!metadata) return false;
      return {
        id: metadata.id,
        grants: ["authorization_code", "refresh_token"],
        redirectUris: metadata.redirect_uris,
      };
    },
    async validateScope(current, _client, scopes) {
      if (
        !scopes?.length ||
        !scopes.every((scope) => (aiScopes as readonly string[]).includes(scope))
      )
        return false;
      const approved = current.approved_scopes as string[] | undefined;
      return approved && scopes.some((scope) => !approved.includes(scope)) ? false : scopes;
    },
    async validateRedirectUri(uri, current) {
      return current.redirectUris?.includes(uri) ?? false;
    },
    async saveAuthorizationCode(code, current, authorized) {
      const result = (await store("code_save", {
        hash: credentialHash(code.authorizationCode),
        expires_at: code.expiresAt.toISOString(),
        user_key: authorized.id,
        client_id: current.id,
        scopes: code.scope,
        trip_ids: authorized.trip_ids,
        all_trips: authorized.all_trips,
        ...config,
        payload: {
          expiresAt: code.expiresAt.toISOString(),
          redirectUri: code.redirectUri,
          scope: code.scope,
          codeChallenge: code.codeChallenge,
          codeChallengeMethod: code.codeChallengeMethod,
        },
      })) as { connection_id: string };
      return {
        ...code,
        client: current,
        user: { ...authorized, connection_id: result.connection_id },
      };
    },
    async getAuthorizationCode(token) {
      const data = await get("code", token);
      return data
        ? ({
            ...data,
            authorizationCode: token,
            expiresAt: new Date(String(data.expiresAt)),
            redirectUri: String(data.redirectUri),
            scope: data.scopes,
            client: client(data),
            user: user(data),
          } as OAuth2Server.AuthorizationCode)
        : false;
    },
    async revokeAuthorizationCode(code) {
      return (
        (await store("code_consume", { hash: credentialHash(code.authorizationCode) })) === true
      );
    },
    async saveToken(token, current, authorized) {
      if (!token.refreshToken || !token.accessTokenExpiresAt || !token.refreshTokenExpiresAt)
        throw new AiError("INVALID_TOKEN");
      await store("tokens_save", {
        connection_id: authorized.connection_id,
        credentials: [
          {
            kind: "access",
            hash: credentialHash(token.accessToken),
            expires_at: token.accessTokenExpiresAt.toISOString(),
          },
          {
            kind: "refresh",
            hash: credentialHash(token.refreshToken),
            expires_at: token.refreshTokenExpiresAt.toISOString(),
          },
        ],
        payload: {
          accessTokenExpiresAt: token.accessTokenExpiresAt.toISOString(),
          refreshTokenExpiresAt: token.refreshTokenExpiresAt.toISOString(),
          scope: token.scope,
        },
      });
      return {
        ...token,
        accessToken: String(token.accessToken),
        client: current,
        user: authorized,
      };
    },
    async getAccessToken(token) {
      const data = await get("access", token);
      return data
        ? {
            accessToken: token,
            accessTokenExpiresAt: new Date(String(data.accessTokenExpiresAt)),
            scope: data.scopes,
            client: client(data),
            user: user(data),
          }
        : false;
    },
    async getRefreshToken(token) {
      const data = await get("refresh", token);
      return data
        ? {
            refreshToken: token,
            refreshTokenExpiresAt: new Date(String(data.refreshTokenExpiresAt)),
            scope: data.scopes,
            client: client(data),
            user: user(data),
          }
        : false;
    },
    async revokeToken(token) {
      return (
        (await store("refresh_consume", { hash: credentialHash(token.refreshToken) })) === true
      );
    },
  };
  return {
    model,
    store,
    server: new OAuth2Server({
      model,
      accessTokenLifetime: 900,
      refreshTokenLifetime: 30 * 86400,
      authorizationCodeLifetime: 120,
    }),
  };
}
