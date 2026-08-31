import { PlatformOperationError } from "../contracts/errors.ts";

type CloudBaseAccessClaims = Readonly<{
  email?: unknown;
  exp: number;
  iat?: unknown;
  is_anonymous?: unknown;
  iss: string;
  sub: string;
  user_metadata?: unknown;
}>;

type CloudBaseJsonWebKey = JsonWebKey & Readonly<{ alg?: string; kid?: string; use?: string }>;
type JsonWebKeySet = Readonly<{ keys?: readonly CloudBaseJsonWebKey[] }>;

const keySets = new Map<string, Promise<JsonWebKeySet>>();

export class CloudBaseAccessTokenExpiredError extends Error {
  constructor() {
    super("CloudBase access token expired.");
    this.name = "CloudBaseAccessTokenExpiredError";
  }
}

function decodeJwtPart(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.", {
      cause: error,
    });
  }
}

function expectedIssuer(env: string) {
  return `https://${env}.api.tcloudbasegateway.com`;
}

async function loadKeySet(uri: string, fetcher: typeof fetch, force = false) {
  if (fetcher !== fetch) {
    const response = await fetcher(uri);
    if (!response.ok) throw new Error(`CloudBase key endpoint returned ${response.status}.`);
    return (await response.json()) as JsonWebKeySet;
  }
  if (force) keySets.delete(uri);
  let pending = keySets.get(uri);
  if (!pending) {
    pending = fetcher(uri).then(async (response) => {
      if (!response.ok) throw new Error(`CloudBase key endpoint returned ${response.status}.`);
      return (await response.json()) as JsonWebKeySet;
    });
    keySets.set(uri, pending);
  }
  try {
    return await pending;
  } catch (error) {
    keySets.delete(uri);
    throw error;
  }
}

export async function verifyCloudBaseAccessToken(
  accessToken: string,
  env: string,
  options: Readonly<{ fetcher?: typeof fetch; now?: number }> = {},
): Promise<CloudBaseAccessClaims> {
  const parts = accessToken.split(".");
  if (parts.length !== 3) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const claims = decodeJwtPart(encodedPayload);
  const issuer = expectedIssuer(env);
  if (
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    claims.iss !== issuer ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.exp !== "number"
  ) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.");
  }

  const keySetUri = `${issuer}/auth/v1/certs`;
  const fetcher = options.fetcher ?? fetch;
  let keySet: JsonWebKeySet;
  try {
    keySet = await loadKeySet(keySetUri, fetcher);
    if (fetcher === fetch && !keySet.keys?.some((candidate) => candidate.kid === header.kid)) {
      keySet = await loadKeySet(keySetUri, fetcher, true);
    }
  } catch (error) {
    throw new PlatformOperationError(
      "provider_unavailable",
      "Authentication service is unavailable.",
      { cause: error },
    );
  }
  const jwk = keySet.keys?.find((candidate) => candidate.kid === header.kid);
  if (!jwk || (jwk.alg && jwk.alg !== "RS256") || (jwk.use && jwk.use !== "sig")) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.");
  }
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      Buffer.from(encodedSignature, "base64url"),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!verified) throw new Error("CloudBase access token signature is invalid.");
  } catch (error) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.", {
      cause: error,
    });
  }

  const now = options.now ?? Date.now();
  if (claims.exp * 1000 <= now + 60_000) throw new CloudBaseAccessTokenExpiredError();
  if (typeof claims.iat === "number" && claims.iat * 1000 > now + 60_000) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.");
  }
  return claims as CloudBaseAccessClaims;
}
