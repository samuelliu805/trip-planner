import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ProviderConfigurationError,
  providerMatrixByRegion,
  resolveDeploymentProviderConfig,
  resolvePublicProviderConfig,
  type ProviderEnvironment,
} from "./config/provider-matrix.ts";
import { backendCapabilitiesByRegion } from "./capabilities/backend-capabilities.ts";
import { cloudBasePhase4Status } from "./cloudbase/status.ts";
import { cloudBaseScalarUuidRpc } from "./cloudbase/rpc-compat.ts";
import {
  cloudBasePlaceUpsertRecoveryKey,
  recoverCloudBasePlaceUpsertResult,
} from "./cloudbase/rpc-result-normalization.mjs";
import {
  cloudBaseSessionFromData,
  cloudBaseSessionFromVerifiedTokens,
} from "./cloudbase/session-data.ts";
import type { AppUserId, SignInInput } from "./contracts/auth.ts";
import { PlatformOperationError } from "./contracts/errors.ts";
import { supabasePasswordCredentials } from "./supabase/auth-input.ts";
import {
  directProviderSdkImports,
  directProviderPathImports,
  findBackendProviderBoundaryViolations,
} from "../../scripts/check-backend-provider-boundary.ts";

const globalEnvironment = {
  APP_REGION: "global",
  AUTH_PROVIDER: "supabase",
  DATA_PROVIDER: "supabase",
  NEXT_PUBLIC_MAPS_PROVIDER: "google",
  STORAGE_PROVIDER: "supabase",
} as const;

const cnEnvironment = {
  APP_REGION: "cn",
  AUTH_PROVIDER: "cloudbase",
  DATA_PROVIDER: "cloudbase",
  NEXT_PUBLIC_MAPS_PROVIDER: "amap",
  STORAGE_PROVIDER: "cloudbase",
} as const;

function environmentGuard(
  values: Record<string, string>,
  forbiddenPrefix: string,
): ProviderEnvironment {
  return new Proxy(values, {
    get(target, property, receiver) {
      if (typeof property === "string" && property.startsWith(forbiddenPrefix))
        throw new Error(`Unexpected secret read: ${property}`);
      return Reflect.get(target, property, receiver);
    },
  });
}

test("Global and CN deployment matrices resolve only their legal provider combinations", () => {
  assert.deepEqual(
    resolveDeploymentProviderConfig(globalEnvironment, { mode: "production" }),
    providerMatrixByRegion.global,
  );
  assert.deepEqual(
    resolveDeploymentProviderConfig(cnEnvironment, { mode: "production" }),
    providerMatrixByRegion.cn,
  );
});

test("provider mixing and production defaults fail closed", () => {
  assert.throws(
    () =>
      resolveDeploymentProviderConfig(
        { ...globalEnvironment, STORAGE_PROVIDER: "cloudbase" },
        { mode: "production" },
      ),
    ProviderConfigurationError,
  );
  assert.throws(() => resolveDeploymentProviderConfig({}, { mode: "production" }), /APP_REGION/);
  assert.deepEqual(
    resolveDeploymentProviderConfig({}, { mode: "test" }),
    providerMatrixByRegion.global,
  );
});

test("provider selection never reads the opposite deployment's secrets", () => {
  assert.deepEqual(
    resolveDeploymentProviderConfig(environmentGuard({ ...globalEnvironment }, "CLOUDBASE_"), {
      mode: "production",
    }),
    providerMatrixByRegion.global,
  );
  assert.deepEqual(
    resolveDeploymentProviderConfig(environmentGuard({ ...cnEnvironment }, "SUPABASE_"), {
      mode: "production",
    }),
    providerMatrixByRegion.cn,
  );
});

test("public provider config contains no server secret", () => {
  const publicConfig = resolvePublicProviderConfig(
    { NEXT_PUBLIC_MAPS_PROVIDER: "google" },
    { mode: "production" },
  );
  assert.deepEqual(publicConfig, { mapsProvider: "google" });
  assert.doesNotMatch(JSON.stringify(publicConfig), /SECRET|SUPABASE|CLOUDBASE|CRON/);
});

test("backend capabilities are immutable deployment constants", () => {
  assert.equal(backendCapabilitiesByRegion.global.realtime, true);
  assert.equal(backendCapabilitiesByRegion.cn.realtime, false);
  assert.equal(backendCapabilitiesByRegion.cn.selfRegistration, false);
  assert.equal(backendCapabilitiesByRegion.cn.signedUrls, true);
  assert.equal(backendCapabilitiesByRegion.cn.itineraryItemLinks, false);
  assert.equal(backendCapabilitiesByRegion.global.itineraryItemLinks, true);
  assert.equal(backendCapabilitiesByRegion.cn.passwordSignInIdentifier, "username");
  assert.equal(backendCapabilitiesByRegion.global.passwordSignInIdentifier, "email");
  assert.equal(Object.isFrozen(backendCapabilitiesByRegion), true);
  assert.equal(Object.isFrozen(backendCapabilitiesByRegion.cn), true);
});

test("shared sign-in inputs distinguish email and username credentials", () => {
  const emailPassword: SignInInput = {
    email: "traveler@example.com",
    method: "email_password",
    password: "secret",
  };
  const usernamePassword: SignInInput = {
    method: "username_password",
    password: "secret",
    username: "traveler",
  };

  assert.equal(emailPassword.method, "email_password");
  assert.equal(usernamePassword.method, "username_password");
  assert.deepEqual(supabasePasswordCredentials(emailPassword), {
    email: "traveler@example.com",
    password: "secret",
  });
  assert.throws(
    () => supabasePasswordCredentials(usernamePassword),
    (error) => error instanceof PlatformOperationError && error.code === "unsupported_operation",
  );
});

test("provider-neutral user IDs accept non-UUID identifiers", () => {
  const cloudBaseStyleUserId: AppUserId = "wechat:open-id:user-123";
  assert.equal(cloudBaseStyleUserId, "wechat:open-id:user-123");
});

test("provider SDK imports are restricted to the exact adapter and maintenance allowlist", async () => {
  assert.deepEqual(await findBackendProviderBoundaryViolations(), []);
  assert.deepEqual(directProviderSdkImports('import { createClient } from "@supabase/ssr"'), [
    "@supabase/ssr",
  ]);
  assert.deepEqual(
    directProviderPathImports('import { createClient } from "@/lib/supabase/server"'),
    ["@/lib/supabase/server"],
  );
  assert.deepEqual(
    directProviderPathImports(
      'import { CloudBaseTripRepository } from "@/platform/cloudbase/trip-repository"',
    ),
    ["@/platform/cloudbase/trip-repository"],
  );
  const eslintConfig = await readFile(new URL("../../eslint.config.mjs", import.meta.url), "utf8");
  assert.match(eslintConfig, /no-restricted-imports/);
  assert.match(eslintConfig, /@cloudbase\/js-sdk/);
});

test("CloudBase Phase 4 enables Auth, PG, private storage, and signed URLs", async () => {
  const composition = await readFile(new URL("./composition/server.ts", import.meta.url), "utf8");
  assert.equal(cloudBasePhase4Status.authImplemented, true);
  assert.equal(cloudBasePhase4Status.dataImplemented, true);
  assert.equal(cloudBasePhase4Status.runtimeReady, true);
  assert.equal(cloudBasePhase4Status.storageImplemented, true);
  assert.equal(backendCapabilitiesByRegion.cn.realtime, false);
  assert.match(composition, /new CloudBaseAuthProvider/);
  assert.match(composition, /new CloudBaseTripRepository/);
  assert.match(composition, /new CloudBaseStorageProvider/);
});

test("Phase 2 is schema-only and does not promise backend runtime adapters", async () => {
  const architecture = await readFile(
    new URL("../../docs/backend-provider-architecture-phase-1.md", import.meta.url),
    "utf8",
  );
  const phase2 = architecture.match(/### Phase 2[\s\S]*?(?=### Phase 3)/)?.[0];
  assert.ok(phase2);
  assert.match(phase2, /schema baseline/);
  assert.match(phase2, /overlays/);
  assert.match(phase2, /deployment tooling/);
  assert.match(phase2, /database security validation/);
  assert.match(phase2, /Do not implement Auth, repositories, session behavior, or UI runtime/);
  assert.doesNotMatch(phase2, /Implement CloudBase Auth|repository adapters/);
});

test("Global Supabase auth adapter and proxy retain the existing auth operations", async () => {
  const [adapter, proxy] = await Promise.all([
    readFile(new URL("./supabase/auth-provider.ts", import.meta.url), "utf8"),
    readFile(new URL("./supabase/proxy.ts", import.meta.url), "utf8"),
  ]);

  assert.match(adapter, /signInWithPassword\(credentials\)/);
  assert.match(adapter, /signInWithOAuth\(\{[\s\S]*provider: "google"/);
  assert.match(adapter, /auth\.signUp/);
  assert.match(adapter, /exchangeCodeForSession\(code\)/);
  assert.match(proxy, /getAll: \(\) => request\.cookies\.getAll\(\)/);
  assert.match(proxy, /setAll\(cookiesToSet\)/);
  assert.match(proxy, /supabase\.auth\.getUser\(\)/);
});

test("Successful password login invalidates the Trips page before redirecting", async () => {
  const actions = await readFile(new URL("../features/auth/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /revalidatePath\("\/trips"\);\s*redirect\("\/trips"\);/);
});

test("CloudBase adapters expose Trip parity and use the approved PG/Auth SDK surface", async () => {
  const [auth, trips, client, sessionRuntime] = await Promise.all([
    readFile(new URL("./cloudbase/auth-provider.ts", import.meta.url), "utf8"),
    readFile(new URL("./cloudbase/trip-repository.ts", import.meta.url), "utf8"),
    readFile(new URL("./cloudbase/client.ts", import.meta.url), "utf8"),
    readFile(new URL("./cloudbase/session-runtime.ts", import.meta.url), "utf8"),
  ]);
  for (const method of [
    "listForCurrentUser",
    "getById",
    "getDefaultCurrencyForCurrentUser",
    "create",
    "update",
    "setStatus",
    "renameIfTitle",
    "remove",
  ]) {
    assert.match(trips, new RegExp(`async ${method}\\(`));
  }
  assert.match(auth, /signInWithPassword\(\{[\s\S]*username: input\.username/);
  assert.match(auth, /getSession\(\)/);
  assert.match(sessionRuntime, /setSession\(/);
  assert.match(sessionRuntime, /getSession\(/);
  assert.match(sessionRuntime, /refreshSession\(/);
  assert.match(client, /app\.rdb\(\)/);
  assert.doesNotMatch(trips, /\.where\(|\.orderBy\(|\.count\(/);
  assert.doesNotMatch(auth, /getUser\(/);
});

test("CloudBase scalar UUID compatibility recovers only the validated SDK parser failure", async () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(
    await cloudBaseScalarUuidRpc({
      execute: async () => ({ data: id, error: null }),
      recover: async () => null,
      safeMessage: "failed",
    }),
    id,
  );
  assert.equal(
    await cloudBaseScalarUuidRpc({
      execute: async () => ({
        data: null,
        error: { message: "SyntaxError: value is not valid JSON" },
      }),
      recover: async () => ({ id }),
      safeMessage: "failed",
    }),
    id,
  );
  await assert.rejects(() =>
    cloudBaseScalarUuidRpc({
      execute: async () => ({ data: null, error: { message: "network unavailable" } }),
      recover: async () => ({ id }),
      safeMessage: "failed",
    }),
  );
});

test("CloudBase place RPC recovery is limited to a canonical provider identity", () => {
  const parameters = {
    place_coordinate_system: "wgs84",
    place_latitude: 31.24001,
    place_longitude: 121.49001,
    place_provider: "amap",
    provider_place_id: "B0FFG6A2XR",
    target_trip_id: "123e4567-e89b-42d3-a456-426614174000",
  };
  assert.deepEqual(cloudBasePlaceUpsertRecoveryKey("upsert_place_snapshot_v3", parameters, true), {
    provider: "amap",
    providerPlaceId: "B0FFG6A2XR",
    tripId: parameters.target_trip_id,
  });
  assert.equal(
    cloudBasePlaceUpsertRecoveryKey("upsert_place_snapshot_v3", parameters, false),
    null,
  );
  assert.equal(
    cloudBasePlaceUpsertRecoveryKey(
      "upsert_place_snapshot_v3",
      { ...parameters, place_coordinate_system: "gcj02" },
      true,
    ),
    null,
  );
  assert.equal(cloudBasePlaceUpsertRecoveryKey("create_trip", parameters, true), null);
});

test("CloudBase place RPC recovery accepts one RLS-scoped UUID and preserves every failure", () => {
  const original = {
    data: null,
    error: { message: "SyntaxError: value is not valid JSON" },
  };
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.deepEqual(recoverCloudBasePlaceUpsertResult(original, { data: [{ id }], error: null }), {
    data: id,
    error: null,
  });
  for (const lookup of [
    { data: [], error: null },
    { data: [{ id }, { id }], error: null },
    { data: [{ id: "not-a-uuid" }], error: null },
    { data: [{ id }], error: { message: "permission denied" } },
  ]) {
    assert.equal(recoverCloudBasePlaceUpsertResult(original, lookup), original);
  }
});

test("CloudBase session normalization supports the SDK 3.9 Node user ID accessor", () => {
  const session = cloudBaseSessionFromData({
    session: {
      access_token: "access",
      refresh_token: "refresh",
      user: {
        email: "traveler@example.com",
        id() {
          return "cloudbase-user-123";
        },
        user_metadata: { username: "traveler" },
      },
    },
  });
  assert.equal(session.user.id, "cloudbase-user-123");
  assert.equal(session.user.email, "traveler@example.com");
  assert.deepEqual(session.user.metadata, { username: "traveler" });
  assert.throws(
    () =>
      cloudBaseSessionFromData({
        access_token: "access",
        refresh_token: "refresh",
        user: { id: "anonymous-user", is_anonymous: true },
      }),
    (error) => error instanceof PlatformOperationError && error.code === "authentication_required",
  );
});

test("CloudBase verified JWT normalization rejects expiry and keeps provider-neutral identity", () => {
  const accessToken = [
    "header",
    Buffer.from(
      JSON.stringify({
        email: "traveler@example.com",
        exp: Math.floor(Date.now() / 1000) + 60,
        sub: "cloudbase-user-123",
        user_metadata: { username: "traveler" },
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
  assert.equal(
    cloudBaseSessionFromVerifiedTokens({ accessToken, refreshToken: "refresh" }).user.id,
    "cloudbase-user-123",
  );
  const expired = [
    "header",
    Buffer.from(JSON.stringify({ exp: 1, sub: "cloudbase-user-123" })).toString("base64url"),
    "signature",
  ].join(".");
  assert.throws(
    () => cloudBaseSessionFromVerifiedTokens({ accessToken: expired, refreshToken: "refresh" }),
    (error) => error instanceof PlatformOperationError && error.code === "authentication_required",
  );
});
