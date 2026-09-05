import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compactCommand } from "./lib/compact-command.mjs";
import {
  readStaticValidationCache,
  staticValidationFingerprint,
  validationStateDirectory,
  writeStaticValidationCache,
} from "./lib/validation-cache.mjs";

import {
  approvedCloudBaseTarget,
  createRegionEnvironment,
  createSanitizedEnvironment,
  readE2EInventory,
  validateRegionEnvironment,
} from "./e2e-env-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

function parseArguments(argv) {
  let mode = "preflight";
  let region = "all";
  let fresh = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--preflight") mode = "preflight";
    else if (argument === "--static") mode = "static";
    else if (argument === "--live") mode = "live";
    else if (argument === "--fresh") fresh = true;
    else if (argument === "--region") region = argv[++index];
    else if (argument === "--help") return { fresh, help: true, mode, region };
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!new Set(["all", "cn", "global"]).has(region)) {
    throw new Error("--region must be global, cn, or all");
  }
  return { fresh, help: false, mode, region };
}

function selectedRegions(region) {
  return region === "all" ? ["global", "cn"] : [region];
}

function executableAvailable(candidates) {
  return candidates.some((candidate) => candidate && existsSync(candidate));
}

function printPreflight(regions, inventory) {
  let ready = true;
  for (const region of regions) {
    const result = validateRegionEnvironment(region, inventory.values);
    ready &&= result.ready;
    process.stdout.write(`${region.toUpperCase()} E2E: ${result.ready ? "ready" : "blocked"}.\n`);
    if (result.missing.length) {
      process.stdout.write(`Missing ${region} variables: ${result.missing.join(", ")}\n`);
    }
    for (const problem of result.problems) process.stdout.write(`${region} problem: ${problem}\n`);
  }
  const chrome = executableAvailable([
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]);
  const agentBrowser = executableAvailable(
    (process.env.PATH ?? "").split(":").map((entry) => resolve(entry, "agent-browser")),
  );
  process.stdout.write(`Chrome/CDP browser: ${chrome ? "ready" : "missing"}.\n`);
  process.stdout.write(`Optional agent-browser CLI: ${agentBrowser ? "ready" : "missing"}.\n`);
  return ready && chrome;
}

async function command(label, executable, args, env) {
  const stateDirectory = await validationStateDirectory(root);
  await compactCommand({
    args,
    cwd: root,
    env,
    executable,
    label,
    logDirectory: resolve(stateDirectory, "logs"),
  });
}

async function cleanBuildOutput() {
  const output = resolve(root, ".next");
  if (output !== `${root}/.next`) throw new Error("Refusing to remove an unexpected build path");
  await rm(output, { force: true, recursive: true });
}

async function runStatic(inventory, { fresh = false } = {}) {
  const env = createSanitizedEnvironment(inventory.fileNames);
  const stateDirectory = await validationStateDirectory(root);
  const fingerprint = await staticValidationFingerprint(root, {
    APP_REGION: env.APP_REGION,
    AUTH_PROVIDER: env.AUTH_PROVIDER,
    DATA_PROVIDER: env.DATA_PROVIDER,
    NEXT_PUBLIC_MAPS_PROVIDER: env.NEXT_PUBLIC_MAPS_PROVIDER,
    STORAGE_PROVIDER: env.STORAGE_PROVIDER,
  });
  const cacheEnabled = !fresh && process.env.CI !== "true";
  const cached = cacheEnabled ? await readStaticValidationCache(stateDirectory) : null;
  if (cached?.fingerprint === fingerprint) {
    process.stdout.write(
      `REUSE static validation ${fingerprint.slice(0, 12)} (${cached.completedAt})\n`,
    );
    return;
  }
  const stages = [
    ["lint", "npm", ["run", "lint"]],
    ["typecheck", "npm", ["run", "typecheck"]],
    ["format", "npm", ["run", "format:check"]],
    ["translations", "npm", ["run", "check:i18n"]],
    ["unit and contract tests", "npm", ["test"]],
    ["backend provider boundary", "npm", ["run", "check:backend-provider-boundary"]],
    ["map provider boundary", "npm", ["run", "check:maps-provider-boundary"]],
    ["CloudBase baseline", "npm", ["run", "check:cloudbase-pg-baseline"]],
    ["CloudBase RPC catalog", "npm", ["run", "check:cloudbase-pg-rpc-surface"]],
    ["migration inventory", "npm", ["run", "check:database-pg-migrations"]],
    ["working-tree whitespace", "git", ["diff", "--check"]],
  ];
  for (const [label, executable, args] of stages) await command(label, executable, args, env);
  await writeStaticValidationCache(stateDirectory, fingerprint);
  process.stdout.write(`CACHE static validation ${fingerprint.slice(0, 12)}\n`);
}

async function buildRegion(region, env) {
  await cleanBuildOutput();
  await command(
    `${region} environment contract`,
    "npm",
    ["run", "check:phase-5-environment", "--", region],
    env,
  );
  if (region === "cn") {
    await command(
      "approved CloudBase target",
      "npm",
      [
        "run",
        "check:cloudbase-pg-target",
        "--",
        "--env-id",
        approvedCloudBaseTarget.CLOUDBASE_ENV_ID,
        "--region",
        approvedCloudBaseTarget.CLOUDBASE_REGION,
        "--instance-id",
        approvedCloudBaseTarget.CLOUDBASE_PG_INSTANCE_ID,
      ],
      env,
    );
  }
  await command(`${region} production build`, "npm", ["run", "build"], env);
  await command(
    `${region} build secret boundary`,
    "npm",
    ["run", "check:build-secret-boundary"],
    env,
  );
  await command(
    `${region} build provider isolation`,
    "npm",
    ["run", "check:build-provider-isolation"],
    env,
  );
}

async function runGlobal(env) {
  let failure;
  try {
    await buildRegion("global", env);
    await command(
      "Global Auth/CRUD/RPC/RLS/share/browser",
      "node",
      ["scripts/global-phase-5-live.mjs"],
      env,
    );
    await command(
      "Global rejects CN cookies",
      "node",
      ["scripts/global-cookie-isolation-e2e.mjs"],
      env,
    );
  } catch (error) {
    failure = error;
  } finally {
    try {
      await command(
        "Global storage and residue cleanup",
        "node",
        ["scripts/supabase-phase-4-storage-live.mjs"],
        env,
      );
    } catch (cleanupError) {
      failure = failure
        ? new AggregateError([failure, cleanupError], "Global E2E and cleanup failed")
        : cleanupError;
    }
  }
  if (failure) throw failure;
}

async function runCn(env) {
  let failure;
  try {
    await buildRegion("cn", env);
    for (const [label, script] of [
      ["CN real AMap route/place", "scripts/amap-phase-5-live.mjs"],
      ["CN repaired feature mutations", "scripts/cloudbase-cn-feature-repair-live.mjs"],
      ["CN RPC surface", "scripts/cloudbase-pg-live-rpc-surface.mjs"],
      ["CN Auth/CRUD/RPC/RLS/share", "scripts/cloudbase-pg-live-rls.mjs"],
      ["CN browser application workflows", "scripts/cloudbase-phase-3-app-e2e.mjs"],
      ["CN private storage", "scripts/cloudbase-phase-4-storage-live.mjs"],
    ]) {
      await command(label, "node", [script], env);
    }
  } catch (error) {
    failure = error;
  } finally {
    for (const [label, script] of [
      ["CN deployed cleanup function", "scripts/invoke-cloudbase-cleanup-http.mjs"],
      ["CN independent residue audit", "scripts/cloudbase-phase-4-cleanup-live.mjs"],
    ]) {
      try {
        await command(label, "node", [script], env);
      } catch (cleanupError) {
        failure = failure
          ? new AggregateError([failure, cleanupError], `${label} also failed`)
          : cleanupError;
      }
    }
  }
  if (failure) throw failure;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      "Usage: node scripts/e2e-regression.mjs <--preflight|--static|--live> [--region global|cn|all] [--fresh]\n",
    );
    return;
  }
  const regions = selectedRegions(options.region);
  const inventory = readE2EInventory(envPath);
  if (options.mode === "static") {
    await runStatic(inventory, options);
    return;
  }
  const ready = printPreflight(regions, inventory);
  if (options.mode === "preflight") {
    if (!ready) process.exitCode = 1;
    return;
  }
  if (!ready) throw new Error("E2E preflight is blocked; fill only the named variables and retry.");

  await runStatic(inventory, options);
  const failures = [];
  for (const region of regions) {
    const env = createRegionEnvironment(region, inventory);
    try {
      if (region === "global") await runGlobal(env);
      else await runCn(env);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "One or more regional E2E suites failed");
  process.stdout.write("\nGlobal/CN E2E regression passed with cleanup.\n");
}

await main();
