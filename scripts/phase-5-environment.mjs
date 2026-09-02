const selector = process.argv[2];
const live = process.argv[3] === "--live";

const requiredBySelector = {
  cn: {
    APP_REGION: "cn",
    AUTH_PROVIDER: "cloudbase",
    DATA_PROVIDER: "cloudbase",
    NEXT_PUBLIC_APP_REGION: "cn",
    NEXT_PUBLIC_MAPS_PROVIDER: "amap",
    STORAGE_PROVIDER: "cloudbase",
  },
  global: {
    APP_REGION: "global",
    AUTH_PROVIDER: "supabase",
    DATA_PROVIDER: "supabase",
    NEXT_PUBLIC_APP_REGION: "global",
    NEXT_PUBLIC_MAPS_PROVIDER: "google",
    STORAGE_PROVIDER: "supabase",
  },
};

const privateNames = [
  "AMAP_JS_SECURITY_CODE",
  "AMAP_WEB_SERVICE_KEY",
  "CLOUDBASE_API_KEY",
  "GOOGLE_PLACES_API_KEY",
  "GOOGLE_ROUTES_API_KEY",
  "SUPABASE_SECRET_KEY",
];

function requireValue(name) {
  if (!process.env[name]?.trim()) throw new Error(`${selector} requires ${name}.`);
}

const expected = requiredBySelector[selector];
if (!expected || (process.argv[3] && !live) || process.argv.length > 4) {
  throw new Error("Usage: phase-5-environment.mjs <global|cn> [--live]");
}
for (const [name, value] of Object.entries(expected)) {
  if (process.env[name] !== value) throw new Error(`${selector} requires ${name}=${value}.`);
}
for (const name of privateNames) {
  if (name.startsWith("NEXT_PUBLIC_")) throw new Error(`${name} must remain server-only.`);
}

if (selector === "global") {
  requireValue("NEXT_PUBLIC_SUPABASE_URL");
  requireValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (live) {
    for (const name of [
      "CRON_SECRET",
      "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
      "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID",
      "SUPABASE_SECRET_KEY",
    ])
      requireValue(name);
  }
  for (const name of [
    "AMAP_JS_SECURITY_CODE",
    "AMAP_WEB_SERVICE_KEY",
    "CLOUDBASE_API_KEY",
    "CLOUDBASE_ENV_ID",
    "NEXT_PUBLIC_AMAP_JS_API_KEY",
    "NEXT_PUBLIC_CLOUDBASE_ENV_ID",
  ]) {
    if (process.env[name]) throw new Error(`Global must not receive ${name}.`);
  }
} else {
  for (const name of [
    "CLOUDBASE_ENV_ID",
    "CLOUDBASE_PUBLISHABLE_KEY",
    "CLOUDBASE_REGION",
    "NEXT_PUBLIC_AMAP_JS_API_KEY",
    "NEXT_PUBLIC_CLOUDBASE_ENV_ID",
    "NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_CLOUDBASE_REGION",
  ])
    requireValue(name);
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
  ]) {
    if (process.env[name]) throw new Error(`CN must not receive ${name}.`);
  }
  if (live) {
    for (const name of [
      "AMAP_JS_SECURITY_CODE",
      "AMAP_WEB_SERVICE_KEY",
      "CLOUDBASE_API_KEY",
      "CLOUDBASE_TEST_USER_A_PASSWORD",
      "CLOUDBASE_TEST_USER_B_PASSWORD",
    ])
      requireValue(name);
  }
}

process.stdout.write(`Phase 5 ${selector} environment validation passed.\n`);
