import assert from "node:assert/strict";
import test from "node:test";

import { PlatformOperationError } from "../contracts/errors.ts";
import { CloudBaseAccessTokenExpiredError, verifyCloudBaseAccessToken } from "./access-token.ts";

const environment = "phase3-unit-test";
const issuer = `https://${environment}.api.tcloudbasegateway.com`;

async function signedToken(claims: Readonly<Record<string, unknown>>) {
  const keys = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSASSA-PKCS1-v1_5",
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  );
  const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "phase3-key" })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keys.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return {
    fetcher: (async (url: string | URL | Request) => {
      assert.equal(String(url), `${issuer}/auth/v1/certs`);
      return Response.json({
        keys: [{ ...publicKey, alg: "RS256", kid: "phase3-key", use: "sig" }],
      });
    }) as typeof fetch,
    token: `${header}.${payload}.${Buffer.from(signature).toString("base64url")}`,
  };
}

test("CloudBase access tokens require a valid issuer-bound RS256 signature", async () => {
  const now = Date.now();
  const fixture = await signedToken({
    email: "traveler@example.com",
    exp: Math.floor(now / 1000) + 600,
    iat: Math.floor(now / 1000),
    iss: issuer,
    sub: "user-a",
  });
  const claims = await verifyCloudBaseAccessToken(fixture.token, environment, {
    fetcher: fixture.fetcher,
    now,
  });
  assert.equal(claims.sub, "user-a");
  assert.equal(claims.email, "traveler@example.com");

  const [encodedHeader, encodedPayload, encodedSignature] = fixture.token.split(".");
  const tamperedSignature = Buffer.from(encodedSignature, "base64url");
  tamperedSignature[0] ^= 1;
  const tampered = `${encodedHeader}.${encodedPayload}.${tamperedSignature.toString("base64url")}`;
  await assert.rejects(
    () =>
      verifyCloudBaseAccessToken(tampered, environment, {
        fetcher: fixture.fetcher,
        now,
      }),
    (error) => error instanceof PlatformOperationError && error.code === "authentication_required",
  );
});

test("a signed expired CloudBase access token enters the refresh path", async () => {
  const now = Date.now();
  const fixture = await signedToken({
    exp: Math.floor(now / 1000) - 1,
    iat: Math.floor(now / 1000) - 7_200,
    iss: issuer,
    sub: "user-a",
  });
  await assert.rejects(
    () =>
      verifyCloudBaseAccessToken(fixture.token, environment, {
        fetcher: fixture.fetcher,
        now,
      }),
    CloudBaseAccessTokenExpiredError,
  );
});
