import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const supabaseDir = join(root, "supabase/migrations");
const manifestPath = join(root, "database/cloudbase/bootstrap-manifest.json");
const overlayDir = join(root, "database/cloudbase/overlays");

export const artifactPaths = {
  shared: join(root, "database/shared/baseline.sql"),
  cloudbase: join(root, "database/cloudbase/baseline.sql"),
  baselineMigration: join(root, "cloudbase/migrations/20260831030000_trip_planner_baseline.sql"),
  rpcGrantMigration: join(root, "cloudbase/migrations/20260831031000_cloudbase_rpc_grants.sql"),
  securityMigration: join(
    root,
    "cloudbase/migrations/20260831032000_cloudbase_security_hardening.sql",
  ),
};

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

const omittedPhase4Functions = [
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

const reviewedManagedSchemaMigrations = new Set([
  "20260831170000_cloudbase_pg_storage_phase_four.sql",
]);

export function splitStatements(sql) {
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
  if (omittedPhase4Functions.some((name) => lower.includes(name))) return true;
  if (/^(grant|revoke)\b/i.test(command)) return true;
  return /^alter\s+default\s+privileges\b/i.test(command);
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
    .replace(/\bauth\.uid\(\)/gi, "app_private.app_current_user_id()")
    .replace(/\bpublic\.app_current_user_id\b/gi, "app_private.app_current_user_id")
    .replace(/\bpublic\.is_trip_member\b/gi, "app_private.is_trip_member")
    .replace(/\bpublic\.variant_trip_id\b/gi, "app_private.variant_trip_id")
    .replace(
      /\bcurrent_user_id\s+uuid\s*:=\s*app_private\.app_current_user_id\(\)/gi,
      "current_user_id varchar(64) := app_private.app_current_user_id()",
    )
    .trim();
}

function buildShared(migrationFiles) {
  const kept = [];
  for (const file of migrationFiles) {
    const transformed = splitStatements(readFileSync(join(supabaseDir, file), "utf8"))
      .filter((statement) => !shouldSkip(statement))
      .map(transform);
    if (transformed.length) {
      kept.push(`-- Source: supabase/migrations/${file}\n${transformed.join("\n\n")}`);
    }
  }
  const header = [
    "-- Generated by scripts/cloudbase-pg-baseline.mjs. Do not edit this file directly.",
    `-- Derived from ${migrationFiles.length} immutable Supabase migrations.`,
    "-- Managed auth/storage objects and Phase 4 storage operations are intentionally omitted.",
    "",
  ].join("\n");
  return `${header}${kept.join("\n\n")}\n`;
}

function renderMigration(version, title, description, body) {
  return `${[
    `-- Trip Planner CloudBase PG ${title} version ${version}.`,
    "-- Reusable SQL artifact: validate Env ID, region, database and PG instance at deployment time.",
    "BEGIN;",
    body.trim(),
    `INSERT INTO public.app_schema_migrations (version, description) VALUES ('${version}', '${description}');`,
    "COMMIT;",
  ].join("\n\n")}\n`;
}

export function verifyBootstrapManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.baselineMigrationCount !== 63 || manifest.migrations.length !== 63) {
    throw new Error("Bootstrap manifest must contain exactly 63 migrations");
  }
  const actual = readdirSync(supabaseDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const frozen = manifest.migrations.map(([file]) => file);
  if (JSON.stringify(actual.slice(0, frozen.length)) !== JSON.stringify(frozen)) {
    throw new Error("Frozen Supabase migration order differs from bootstrap manifest");
  }
  for (const [file, expected] of manifest.migrations) {
    const actualHash = createHash("sha256")
      .update(readFileSync(join(supabaseDir, file)))
      .digest("hex");
    if (actualHash !== expected) throw new Error(`Frozen migration changed: ${file}`);
  }
  for (const file of readdirSync(join(root, "cloudbase/migrations")).filter((name) =>
    name.endsWith(".sql"),
  )) {
    const sql = readFileSync(join(root, "cloudbase/migrations", file), "utf8")
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    if (
      !reviewedManagedSchemaMigrations.has(file) &&
      (/\b(?:create|alter|drop)\s+(?:schema|table|function|policy|trigger|type|view)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:auth|storage)\b/i.test(
        sql,
      ) ||
        /\b(?:insert\s+into|update|delete\s+from)\s+(?:auth|storage)\s*\./i.test(sql) ||
        /\b(?:grant|revoke)\b[\s\S]{0,120}\bon\s+(?:table|function|schema)\s+(?:auth|storage)\b/i.test(
          sql,
        ))
    ) {
      throw new Error(`Project migration modifies a managed schema: ${file}`);
    }
  }
  return manifest;
}

export function renderArtifacts(manifest) {
  const files = manifest.migrations.map(([file]) => file);
  const shared = buildShared(files);
  const identity = readFileSync(join(overlayDir, "identity.sql"), "utf8").trim();
  const security = readFileSync(join(overlayDir, "security.sql"), "utf8").trim();
  const baseline = renderMigration(
    "20260831030000",
    "baseline",
    "Trip Planner CloudBase PG baseline",
    [
      "SET LOCAL lock_timeout = '5s';",
      "SET LOCAL statement_timeout = '120s';",
      identity,
      shared,
      security,
    ].join("\n\n"),
  );
  const executableBaseline = baseline.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const authUidCalls = executableBaseline.match(/\bauth\.uid\(\)/gi) ?? [];
  if (
    /phase2_rename_owned_trip|\bauth\.users\b|\bpublic\.(?:app_current_user_id|is_trip_member|variant_trip_id)\b/i.test(
      baseline,
    ) ||
    authUidCalls.length !== 1
  ) {
    throw new Error(
      `Fresh CloudBase baseline identity safety failed (auth.uid=${authUidCalls.length}, probe=${/phase2_rename_owned_trip/i.test(baseline)}, auth.users=${/\bauth\.users\b/i.test(baseline)}, public-helper=${/\bpublic\.(?:app_current_user_id|is_trip_member|variant_trip_id)\b/i.test(baseline)})`,
    );
  }
  const rpc = renderMigration(
    "20260831031000",
    "RPC grants",
    "CloudBase RPC grant overlay",
    readFileSync(join(overlayDir, "rpc-grants.sql"), "utf8"),
  );
  const hardening = renderMigration(
    "20260831032000",
    "security hardening",
    "CloudBase private table ACL and invoker hardening",
    readFileSync(join(overlayDir, "security-hardening.sql"), "utf8"),
  );
  return {
    shared,
    cloudbase: baseline,
    baselineMigration: baseline,
    rpcGrantMigration: rpc,
    securityMigration: hardening,
  };
}

export function checkArtifacts(rendered) {
  const failures = [];
  for (const [name, expected] of Object.entries(rendered)) {
    const actual = readFileSync(artifactPaths[name], "utf8");
    if (actual !== expected) failures.push(artifactPaths[name]);
  }
  if (failures.length) throw new Error(`Generated artifact drift:\n${failures.join("\n")}`);
}

export function writeArtifacts(rendered) {
  for (const [name, contents] of Object.entries(rendered))
    writeFileSync(artifactPaths[name], contents);
}
