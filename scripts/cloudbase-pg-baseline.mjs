import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = join(root, "supabase/migrations");
const sharedPath = join(root, "database/shared/baseline.sql");
const cloudbasePath = join(root, "database/cloudbase/baseline.sql");
const migrationPath = join(root, "cloudbase/migrations/20260831030000_trip_planner_baseline.sql");
const identityPath = join(root, "database/cloudbase/overlays/identity.sql");
const securityPath = join(root, "database/cloudbase/overlays/security.sql");
const version = "20260831030000";

const identityColumns = new Map([
  ["profiles", ["id"]],
  ["trips", ["owner_id"]],
  ["trip_members", ["user_id"]],
  ["public_itinerary_links", ["created_by"]],
  ["research_plan_applications", ["applied_by"]],
  ["share_image_exports", ["owner_id"]],
  ["assets", ["owner_id"]],
  ["asset_links", ["owner_id"]],
  ["asset_deletion_queue", ["owner_id"]],
]);

const phase4Functions = [
  "asset_cleanup_batch_v1",
  "asset_cleanup_batch_v2",
  "expired_share_image_cleanup_batch_v1",
  "fail_asset_cleanup_v1",
  "finalize_asset_cleanup_v1",
  "finalize_expired_share_image_cleanup_v1",
  "service_public_asset_access_v1",
  "service_public_asset_access_v2",
  "untracked_asset_storage_batch_v1",
];

function splitStatements(sql) {
  const statements = [];
  let start = 0;
  let mode = "normal";
  let dollarTag = "";
  for (let index = 0; index < sql.length; index += 1) {
    const here = sql.slice(index);
    const char = sql[index];
    const next = sql[index + 1];
    if (mode === "line") {
      if (char === "\n") mode = "normal";
      continue;
    }
    if (mode === "block") {
      if (char === "*" && next === "/") {
        mode = "normal";
        index += 1;
      }
      continue;
    }
    if (mode === "single") {
      if (char === "'" && next === "'") index += 1;
      else if (char === "'") mode = "normal";
      continue;
    }
    if (mode === "double") {
      if (char === '"' && next === '"') index += 1;
      else if (char === '"') mode = "normal";
      continue;
    }
    if (mode === "dollar") {
      if (here.startsWith(dollarTag)) {
        index += dollarTag.length - 1;
        mode = "normal";
      }
      continue;
    }
    if (char === "-" && next === "-") {
      mode = "line";
      index += 1;
    } else if (char === "/" && next === "*") {
      mode = "block";
      index += 1;
    } else if (char === "'") mode = "single";
    else if (char === '"') mode = "double";
    else if (char === "$") {
      const match = here.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        mode = "dollar";
        index += dollarTag.length - 1;
      }
    } else if (char === ";") {
      const statement = sql.slice(start, index + 1).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function commandText(statement) {
  return statement.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/g, "").trim();
}

function shouldSkip(statement) {
  const command = commandText(statement);
  const lower = command.toLowerCase();
  if (!command || /^(begin|commit|rollback)\s*;?$/i.test(command)) return true;
  if (/^create\s+extension\b/i.test(command) && !/\bpgcrypto\b/i.test(command)) return true;
  if (/\b(supabase_migrations|realtime|vault)\b/i.test(command)) return true;
  if (/\bstorage\s*\./i.test(command) || /\bprivate\s*\./i.test(command)) return true;
  if (/\b(on|into|update|from|table)\s+auth\s*\./i.test(command)) {
    return !/\breferences\s+auth\.users\b/i.test(command);
  }
  if (/\bhandle_new_user\b/i.test(command)) return true;
  if (phase4Functions.some((name) => lower.includes(name))) return true;
  if (/^(grant|revoke)\b/i.test(command)) return true;
  if (/^alter\s+default\s+privileges\b/i.test(command)) return true;
  return false;
}

function replaceIdentityColumns(statement) {
  let result = statement.replace(
    /\s+references\s+auth\.users\s*\(\s*id\s*\)\s+on\s+delete\s+(?:cascade|set\s+null)/gi,
    "",
  );
  for (const [table, columns] of identityColumns) {
    const tablePattern = new RegExp(
      `\\b(?:create|alter)\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`,
      "i",
    );
    if (!tablePattern.test(result)) continue;
    for (const column of columns) {
      result = result.replace(new RegExp(`(\\b${column}\\s+)uuid\\b`, "gi"), "$1varchar(64)");
    }
  }
  return result;
}

function transform(statement) {
  const command = commandText(statement);
  if (/^create\s+extension\b/i.test(command) && /\bpgcrypto\b/i.test(command)) {
    return "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;";
  }
  return replaceIdentityColumns(statement)
    .replace(/\bauth\.uid\(\)/gi, "public.app_current_user_id()")
    .replace(
      /\bcurrent_user_id\s+uuid\s*:=\s*public\.app_current_user_id\(\)/gi,
      "current_user_id varchar(64) := public.app_current_user_id()",
    )
    .trim();
}

function buildShared(migrationFiles) {
  const kept = [];
  const omitted = [];
  for (const file of migrationFiles) {
    const statements = splitStatements(readFileSync(join(migrationDir, file), "utf8"));
    const transformed = [];
    for (const statement of statements) {
      if (shouldSkip(statement))
        omitted.push({ file, statement: commandText(statement).slice(0, 100) });
      else transformed.push(transform(statement));
    }
    if (transformed.length > 0) {
      kept.push(`-- Source: supabase/migrations/${file}\n${transformed.join("\n\n")}`);
    }
  }
  const header = [
    "-- Generated by scripts/cloudbase-pg-baseline.mjs. Do not edit this file directly.",
    `-- Derived from ${migrationFiles.length} immutable Supabase migrations.`,
    "-- Managed auth/storage objects and Phase 4 storage operations are intentionally omitted.",
    "",
  ].join("\n");
  return { sql: `${header}${kept.join("\n\n")}\n`, omitted };
}

function validate(sql, migrationCount) {
  const executable = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const assertions = [
    [migrationCount === 63, `expected 63 Supabase migrations, found ${migrationCount}`],
    [
      !executable.includes("supabase_migrations"),
      "Supabase migration history leaked into baseline",
    ],
    [!/[\s.]storage\s*\./i.test(executable), "managed storage reference leaked into baseline"],
    [!/[\s.]auth\.users\b/i.test(executable), "managed auth.users reference leaked into baseline"],
    [!/[\s.]auth\.uid\(\)/i.test(executable), "raw auth.uid() leaked outside identity overlay"],
    [!/[\s.]current_user_id\s+uuid\b/i.test(executable), "UUID current_user_id remains"],
    [
      !phase4Functions.some((name) => executable.includes(name)),
      "Phase 4 function leaked into baseline",
    ],
  ];
  const failures = assertions.filter(([ok]) => !ok).map(([, message]) => message);
  if (failures.length) throw new Error(failures.join("\n"));
}

function inspectEnv() {
  const expected = {
    CLOUDBASE_ENV_ID: "trip-planner-cn-dev-d3bz94038b26",
    CLOUDBASE_REGION: "ap-shanghai",
    CLOUDBASE_PG_INSTANCE_ID: "pgdb-l4lhtrv7",
  };
  const envPath = join(root, ".env.local");
  const text = readFileSync(envPath, "utf8");
  for (const [name, value] of Object.entries(expected)) {
    const matches = [...text.matchAll(new RegExp(`^${name}=(.*)$`, "gm"))];
    if (matches.length !== 1 || matches[0][1] !== value)
      throw new Error(`${name} is not safely bound`);
  }
  if (/^CLOUDBASE_PG_MIGRATION_URL=/m.test(text)) {
    throw new Error("CLOUDBASE_PG_MIGRATION_URL is not a Phase 2 prerequisite");
  }
  console.log(`Env ID: ${expected.CLOUDBASE_ENV_ID}`);
  console.log(`Region: ${expected.CLOUDBASE_REGION}`);
  console.log(`PG instance ID: ${expected.CLOUDBASE_PG_INSTANCE_ID}`);
  console.log("Database: pgdb-l4lhtrv7");
}

async function build() {
  const migrationFiles = readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const { sql: shared, omitted } = buildShared(migrationFiles);
  validate(shared, migrationFiles.length);
  const identity = readFileSync(identityPath, "utf8").trim();
  const security = readFileSync(securityPath, "utf8").trim();
  const combined = [
    `-- Trip Planner CloudBase PG baseline version ${version}`,
    "-- Apply only to trip-planner-cn-dev-d3bz94038b26 / pgdb-l4lhtrv7.",
    "BEGIN;",
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '120s';",
    identity,
    shared.trim(),
    security,
    `INSERT INTO public.app_schema_migrations (version, description) VALUES ('${version}', 'Trip Planner CloudBase PG baseline');`,
    "COMMIT;",
    "",
  ].join("\n\n");
  await mkdir(dirname(sharedPath), { recursive: true });
  await mkdir(dirname(cloudbasePath), { recursive: true });
  await mkdir(dirname(migrationPath), { recursive: true });
  writeFileSync(sharedPath, shared);
  writeFileSync(cloudbasePath, combined);
  writeFileSync(migrationPath, combined);
  console.log(`Built ${sharedPath}`);
  console.log(`Built ${cloudbasePath}`);
  console.log(`Built ${migrationPath}`);
  console.log(`Sources: ${migrationFiles.length}; omitted platform statements: ${omitted.length}`);
}

const command = process.argv[2] ?? "check";
if (command === "inspect") inspectEnv();
else if (command === "build") await build();
else if (command === "check") {
  inspectEnv();
  const files = readdirSync(migrationDir).filter((name) => name.endsWith(".sql"));
  validate(readFileSync(sharedPath, "utf8"), files.length);
  console.log(`Baseline version ${version} passed static safety checks.`);
} else throw new Error(`Unknown command: ${command}`);
