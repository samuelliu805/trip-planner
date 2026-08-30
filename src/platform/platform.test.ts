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
import type { AppUserId } from "./contracts/auth.ts";
import {
  directProviderSdkImports,
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
  assert.equal(backendCapabilitiesByRegion.cn.signedUrls, false);
  assert.equal(Object.isFrozen(backendCapabilitiesByRegion), true);
  assert.equal(Object.isFrozen(backendCapabilitiesByRegion.cn), true);
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
  const eslintConfig = await readFile(new URL("../../eslint.config.mjs", import.meta.url), "utf8");
  assert.match(eslintConfig, /no-restricted-imports/);
  assert.match(eslintConfig, /@cloudbase\/js-sdk/);
});

test("CloudBase Phase 1 remains an explicit fail-closed scaffold", async () => {
  const source = await readFile(new URL("./cloudbase/unavailable.ts", import.meta.url), "utf8");
  assert.match(source, /runtimeReady: false/);
  assert.match(source, /provider_unavailable/);
  assert.doesNotMatch(source, /@cloudbase\//);
});
