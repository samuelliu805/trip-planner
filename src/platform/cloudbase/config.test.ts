import assert from "node:assert/strict";
import test from "node:test";

import { PlatformOperationError } from "../contracts/errors.ts";
import { getCloudBaseAdminConfig } from "./config.ts";

const managedNames = [
  "CLOUDBASE_API_KEY",
  "CLOUDBASE_APIKEY",
  "CLOUDBASE_ENV_ID",
  "CLOUDBASE_PUBLISHABLE_KEY",
  "CLOUDBASE_REGION",
] as const;

function configureApiKeys(apiKey?: string, nativeApiKey?: string) {
  const previous = Object.fromEntries(managedNames.map((name) => [name, process.env[name]]));
  process.env.CLOUDBASE_ENV_ID = " phase-4-test ";
  process.env.CLOUDBASE_PUBLISHABLE_KEY = " publishable-test ";
  process.env.CLOUDBASE_REGION = " ap-shanghai ";

  if (apiKey === undefined) delete process.env.CLOUDBASE_API_KEY;
  else process.env.CLOUDBASE_API_KEY = apiKey;
  if (nativeApiKey === undefined) delete process.env.CLOUDBASE_APIKEY;
  else process.env.CLOUDBASE_APIKEY = nativeApiKey;

  return () => {
    for (const name of managedNames) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

test("CloudBase admin config accepts CLOUDBASE_API_KEY", (context) => {
  context.after(configureApiKeys("  github-api-key  "));
  assert.equal(getCloudBaseAdminConfig().apiKey, "github-api-key");
});

test("CloudBase admin config accepts native CLOUDBASE_APIKEY", (context) => {
  context.after(configureApiKeys(undefined, "  native-api-key  "));
  assert.equal(getCloudBaseAdminConfig().apiKey, "native-api-key");
});

test("CLOUDBASE_API_KEY takes precedence over native CLOUDBASE_APIKEY", (context) => {
  context.after(configureApiKeys("  preferred-api-key  ", "native-api-key"));
  assert.equal(getCloudBaseAdminConfig().apiKey, "preferred-api-key");
});

test("CloudBase admin config fails closed without either API key", (context) => {
  context.after(configureApiKeys("   ", "\t"));
  assert.throws(
    () => getCloudBaseAdminConfig(),
    (error) =>
      error instanceof PlatformOperationError &&
      error.code === "provider_unavailable" &&
      error.message.includes("CLOUDBASE_API_KEY or CLOUDBASE_APIKEY"),
  );
});
