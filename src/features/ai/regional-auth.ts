import { randomUUID } from "node:crypto";
import { importJWK, jwtVerify, SignJWT, type JWTPayload } from "jose";
import { credentialHash } from "./oauth-model";
import { AiError, knownCodes } from "./service";
import type { RegionalConfig } from "./regional-config";
import { boundedBody } from "./http";

type ServiceRole = "gateway" | "cn";
const endpoint = (config: RegionalConfig, role: ServiceRole) =>
  role === "gateway" ? config.gatewayOrigin : config.cnOrigin;

export async function signRegional(
  config: RegionalConfig,
  from: ServiceRole,
  to: ServiceRole,
  purpose: string,
  payload: JWTPayload,
  lifetime = 30,
) {
  const jwk = JSON.parse(config.privateJwk);
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d)
    throw new AiError("REGIONAL_CONFIGURATION_REQUIRED");
  return new SignJWT({ ...payload, purpose })
    .setProtectedHeader({ alg: "ES256", typ: "twg-regional+jwt" })
    .setIssuer(endpoint(config, from))
    .setAudience(endpoint(config, to))
    .setSubject(from)
    .setIssuedAt()
    .setExpirationTime(`${lifetime}s`)
    .setJti(randomUUID())
    .sign(await importJWK(jwk, "ES256"));
}

export async function verifyRegional(
  config: RegionalConfig,
  from: ServiceRole,
  to: ServiceRole,
  purpose: string,
  token: string,
) {
  try {
    const jwk = JSON.parse(config.peerPublicJwk);
    if (jwk.d || jwk.kty !== "EC" || jwk.crv !== "P-256") throw new Error();
    const { payload, protectedHeader } = await jwtVerify(token, await importJWK(jwk, "ES256"), {
      algorithms: ["ES256"],
      issuer: endpoint(config, from),
      audience: endpoint(config, to),
      subject: from,
      requiredClaims: ["exp", "iat", "jti"],
      maxTokenAge: purpose === "bind" ? "5m" : "30s",
    });
    if (protectedHeader.typ !== "twg-regional+jwt" || payload.purpose !== purpose)
      throw new Error();
    return payload;
  } catch {
    throw new AiError("INVALID_SERVICE_IDENTITY");
  }
}

export async function regionalFetch(
  config: RegionalConfig,
  from: ServiceRole,
  to: ServiceRole,
  body: Record<string, unknown>,
) {
  const serialized = JSON.stringify(body);
  const token = await signRegional(config, from, to, "api", { digest: credentialHash(serialized) });
  try {
    const response = await fetch(`${endpoint(config, to)}/api/ai/regional`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: serialized,
    });
    const length = Number(response.headers.get("content-length"));
    if (length > 2 * 1024 * 1024) throw new Error();
    const result = JSON.parse(await boundedBody(response, 2 * 1024 * 1024));
    if (!response.ok) {
      throw new AiError(
        knownCodes.includes(result.error) ? result.error : "REGION_UNAVAILABLE",
        undefined,
        result.issues,
      );
    }
    return result;
  } catch (error) {
    throw error instanceof AiError ? error : new AiError("REGION_UNAVAILABLE");
  }
}
