import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export const approvedCloudBaseTarget = Object.freeze({
  CLOUDBASE_ENV_ID: "trip-planner-cn-dev-d3bz94038b26",
  CLOUDBASE_PG_INSTANCE_ID: "pgdb-l4lhtrv7",
  CLOUDBASE_REGION: "ap-shanghai",
});

export const approvedAmapBrowserHostname =
  "trip-planner-cn-306129-11-1253819205.sh.run.tcloudbase.com";

export const requiredCredentials = Object.freeze({
  global: Object.freeze([
    "CRON_SECRET",
    "GOOGLE_PLACES_API_KEY",
    "GOOGLE_ROUTES_API_KEY",
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
  ]),
  cn: Object.freeze([
    "AMAP_JS_SECURITY_CODE",
    "AMAP_WEB_SERVICE_KEY",
    "CLOUDBASE_API_KEY",
    "CLOUDBASE_ENV_ID",
    "CLOUDBASE_PG_INSTANCE_ID",
    "CLOUDBASE_PUBLISHABLE_KEY",
    "CLOUDBASE_REGION",
    "CLOUDBASE_TEST_USER_A_PASSWORD",
    "CLOUDBASE_TEST_USER_B_PASSWORD",
    "NEXT_PUBLIC_AMAP_JS_API_KEY",
  ]),
});

const controlledNames = new Set([
  ...requiredCredentials.global,
  ...requiredCredentials.cn,
  "APP_REGION",
  "APP_URL",
  "AUTH_PROVIDER",
  "CLOUDBASE_APIKEY",
  "CLOUDBASE_CI_PASSWORD_AUTH_ENABLED",
  "CN_PUBLIC_PHONE_AUTH_ENABLED",
  "DATA_PROVIDER",
  "NEXT_PUBLIC_APP_REGION",
  "NEXT_PUBLIC_CLOUDBASE_ENV_ID",
  "NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLOUDBASE_REGION",
  "NEXT_PUBLIC_MAPS_PROVIDER",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_TELEMETRY_ENABLED",
  "NEXT_PUBLIC_TELEMETRY_ENVIRONMENT",
  "NEXT_PUBLIC_TELEMETRY_PROVIDER",
  "NEXT_PUBLIC_TELEMETRY_REGION",
  "PHASE3_APP_BASE_URL",
  "PHASE3_GLOBAL_BASE_URL",
  "PHASE3_START_APP",
  "PHASE5_AMAP_ALLOWED_HOSTNAME",
  "PHASE5_GLOBAL_BASE_URL",
  "PHASE5_REQUIRE_AMAP_SMOKE",
  "PHASE5_REQUIRE_BROWSER_SMOKE",
  "PHASE5_START_APP",
  "POSTHOG_API_KEY",
  "POSTHOG_PROJECT_ID",
  "STORAGE_PROVIDER",
  "TELEMETRY_ID_HMAC_SECRET",
  "TELEMETRY_SMOKE_TEST_ENABLED",
  "TELEMETRY_SMOKE_TEST_TOKEN",
  "VERCEL_AUTOMATION_BYPASS_SECRET",
]);

const systemNames = new Set([
  "CHROME_PATH",
  "COLORTERM",
  "FORCE_COLOR",
  "HOME",
  "LANG",
  "LC_ALL",
  "NO_COLOR",
  "PATH",
  "SHELL",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "TERM",
  "TMP",
  "TMPDIR",
  "TZ",
  "USER",
  "XDG_CACHE_HOME",
]);

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function readE2EInventory(envFilePath, ambient = process.env) {
  const file = existsSync(envFilePath) ? parseEnv(readFileSync(envFilePath, "utf8")) : {};
  const values = { ...file };
  for (const name of new Set([...Object.keys(file), ...controlledNames])) {
    if (trimmed(ambient[name])) values[name] = ambient[name];
  }
  return { fileNames: Object.keys(file), values };
}

export function validateRegionEnvironment(region, values) {
  if (!(region in requiredCredentials)) throw new Error(`Unknown E2E region: ${region}`);
  const missing = requiredCredentials[region].filter((name) => !trimmed(values[name]));
  const problems = [];
  if (region === "cn") {
    for (const [name, expected] of Object.entries(approvedCloudBaseTarget)) {
      if (trimmed(values[name]) && values[name] !== expected) {
        problems.push(`Unexpected CloudBase target: ${name}`);
      }
    }
    if (
      trimmed(values.NEXT_PUBLIC_AMAP_JS_API_KEY) &&
      values.NEXT_PUBLIC_AMAP_JS_API_KEY === values.AMAP_WEB_SERVICE_KEY
    ) {
      problems.push("NEXT_PUBLIC_AMAP_JS_API_KEY must differ from AMAP_WEB_SERVICE_KEY");
    }
  } else if (
    trimmed(values.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) &&
    [values.GOOGLE_PLACES_API_KEY, values.GOOGLE_ROUTES_API_KEY].includes(
      values.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    )
  ) {
    problems.push("The Google browser key must differ from both server keys");
  }
  return { missing, problems, ready: missing.length === 0 && problems.length === 0 };
}

function safeSystemEnvironment(ambient) {
  const result = {};
  for (const [name, value] of Object.entries(ambient)) {
    if (systemNames.has(name) || /^(?:ALL|HTTP|HTTPS|NO)_PROXY$/i.test(name)) {
      result[name] = value;
    }
  }
  return result;
}

export function createSanitizedEnvironment(fileNames = [], ambient = process.env) {
  const result = {};
  for (const name of new Set([...fileNames, ...controlledNames])) result[name] = "";
  return Object.assign(result, safeSystemEnvironment(ambient));
}

export function createRegionEnvironment(region, inventory, ambient = process.env) {
  const { values, fileNames = [] } = inventory;
  const validation = validateRegionEnvironment(region, values);
  if (!validation.ready) {
    throw new Error(
      [...validation.missing.map((name) => `Missing ${name}`), ...validation.problems].join("; "),
    );
  }

  const result = createSanitizedEnvironment(fileNames, ambient);
  for (const name of requiredCredentials[region]) result[name] = values[name];

  const common = {
    APP_URL: "http://127.0.0.1:3100",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
    NEXT_PUBLIC_TELEMETRY_ENABLED: "false",
    NEXT_PUBLIC_TELEMETRY_ENVIRONMENT: "development",
    TELEMETRY_SMOKE_TEST_ENABLED: "false",
  };
  const regional =
    region === "global"
      ? {
          APP_REGION: "global",
          AUTH_PROVIDER: "supabase",
          DATA_PROVIDER: "supabase",
          NEXT_PUBLIC_APP_REGION: "global",
          NEXT_PUBLIC_MAPS_PROVIDER: "google",
          PHASE3_GLOBAL_BASE_URL: "http://127.0.0.1:3100",
          PHASE5_GLOBAL_BASE_URL: "http://127.0.0.1:3100",
          PHASE5_REQUIRE_BROWSER_SMOKE: "1",
          PHASE5_START_APP: "1",
          STORAGE_PROVIDER: "supabase",
        }
      : {
          APP_REGION: "cn",
          AUTH_PROVIDER: "cloudbase",
          CLOUDBASE_APIKEY: values.CLOUDBASE_API_KEY,
          CN_PUBLIC_PHONE_AUTH_ENABLED: "true",
          DATA_PROVIDER: "cloudbase",
          NEXT_PUBLIC_APP_REGION: "cn",
          NEXT_PUBLIC_CLOUDBASE_ENV_ID: values.CLOUDBASE_ENV_ID,
          NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY: values.CLOUDBASE_PUBLISHABLE_KEY,
          NEXT_PUBLIC_CLOUDBASE_REGION: values.CLOUDBASE_REGION,
          NEXT_PUBLIC_MAPS_PROVIDER: "amap",
          PHASE3_APP_BASE_URL: "http://127.0.0.1:3100",
          PHASE3_START_APP: "1",
          PHASE5_AMAP_ALLOWED_HOSTNAME: approvedAmapBrowserHostname,
          PHASE5_REQUIRE_AMAP_SMOKE: "1",
          STORAGE_PROVIDER: "cloudbase",
        };
  return { ...result, ...common, ...regional };
}

export function controlledEnvironmentNames() {
  return [...controlledNames].sort();
}
