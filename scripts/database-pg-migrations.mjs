import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  root,
  splitStatements,
  verifyBootstrapManifest,
} from "./lib/cloudbase-pg-baseline-lib.mjs";
import { parseFunctions } from "./lib/cloudbase-pg-functions.mjs";

const sharedDir = join(root, "database/shared/migrations");
const supabaseOverlayDir = join(root, "database/supabase/overlays/migrations");
const cloudbaseOverlayDir = join(root, "database/cloudbase/overlays/migrations");
const supabaseDir = join(root, "supabase/migrations");
const cloudbaseDir = join(root, "cloudbase/migrations");
const providerManifestPath = join(root, "database/provider-only-migrations.json");
const allowlistPath = join(root, "database/cloudbase/rpc-allowlist.json");

function filesAt(path) {
  return existsSync(path)
    ? readdirSync(path)
        .filter((name) => name.endsWith(".sql"))
        .sort()
    : [];
}

function sameSet(actual, expected, label) {
  const left = [...new Set(actual)].sort();
  const right = [...new Set(expected)].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    const unexpected = left.filter((file) => !right.includes(file));
    const missing = right.filter((file) => !left.includes(file));
    throw new Error(
      `${label} migration inventory mismatch` +
        `${unexpected.length ? `; unreviewed: ${unexpected.join(", ")}` : ""}` +
        `${missing.length ? `; missing: ${missing.join(", ")}` : ""}`,
    );
  }
}

export function assertMigrationInventory({ frozen, shared, supabase, cloudbase, providerOnly }) {
  const reviewed = new Set();
  for (const entry of providerOnly) {
    if (!["supabase", "cloudbase"].includes(entry.provider) || !entry.file?.endsWith(".sql")) {
      throw new Error("Invalid provider-only migration manifest entry");
    }
    const key = `${entry.provider}:${entry.file}`;
    if (reviewed.has(key)) throw new Error(`Duplicate provider-only migration: ${key}`);
    if (shared.includes(entry.file))
      throw new Error(`Shared migration cannot be provider-only: ${key}`);
    reviewed.add(key);
  }
  sameSet(
    supabase,
    [
      ...frozen,
      ...shared,
      ...providerOnly.filter((x) => x.provider === "supabase").map((x) => x.file),
    ],
    "Supabase",
  );
  sameSet(
    cloudbase,
    [...shared, ...providerOnly.filter((x) => x.provider === "cloudbase").map((x) => x.file)],
    "CloudBase",
  );
}

function transactionBody(file, sql) {
  const match = sql.trim().match(/^BEGIN\s*;\s*([\s\S]*?)\s*COMMIT\s*;$/i);
  if (!match) throw new Error(`Shared migration must be one explicit transaction: ${file}`);
  return match[1].trim();
}

export function renderCloudbaseFunctionAcl(sql, allowlist) {
  const unparsed = splitStatements(sql).filter(
    (statement) =>
      /\bcreate\s+(?:or\s+replace\s+)?function\b/i.test(statement) &&
      parseFunctions(statement).length !== 1,
  );
  if (unparsed.length) {
    throw new Error("A generated CloudBase CREATE FUNCTION lacks an exact parseable signature");
  }
  const routines = parseFunctions(sql);
  if (!routines.length) return "";
  if (routines.some((routine) => routine.securityDefiner && !routine.safeSearchPath)) {
    throw new Error("A generated CloudBase SECURITY DEFINER function has an unsafe search_path");
  }
  const authenticated = new Set(allowlist.authenticated.map(([signature]) => signature));
  const anonymous = new Set(allowlist.anonymous.map(([signature]) => signature));
  const lines = [
    "-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.",
  ];
  for (const routine of routines.sort((left, right) =>
    `${left.schema}.${left.signature}`.localeCompare(`${right.schema}.${right.signature}`),
  )) {
    lines.push(
      `REVOKE EXECUTE ON FUNCTION ${routine.schema}.${routine.signature} FROM PUBLIC, anon, authenticated;`,
    );
    if (routine.schema !== "public") continue;
    if (anonymous.has(routine.signature)) {
      lines.push(`GRANT EXECUTE ON FUNCTION public.${routine.signature} TO anon, authenticated;`);
    } else if (authenticated.has(routine.signature)) {
      lines.push(`GRANT EXECUTE ON FUNCTION public.${routine.signature} TO authenticated;`);
    }
  }
  return lines.join("\n");
}

export function renderProviderMigration({ file, provider, shared, overlay = "", allowlist }) {
  const body = transactionBody(file, shared);
  overlay = overlay.trim();
  const pieces = [
    `-- Generated ${provider} migration from database/shared/migrations/${file}.`,
    "-- Edit the shared source and the minimal provider overlay, then rebuild.",
    "BEGIN;",
    body,
  ];
  if (overlay) pieces.push(`-- ${provider} provider overlay.`, overlay);
  if (provider === "CloudBase") {
    const acl = renderCloudbaseFunctionAcl(`${body}\n${overlay}`, allowlist);
    if (acl) pieces.push(acl);
  }
  pieces.push("COMMIT;");
  return `${pieces.join("\n\n")}\n`;
}

function render(file, provider, overlayDir, allowlist) {
  const shared = readFileSync(join(sharedDir, file), "utf8");
  const overlayPath = join(overlayDir, file);
  const overlay = existsSync(overlayPath) ? readFileSync(overlayPath, "utf8") : "";
  return renderProviderMigration({ file, provider, shared, overlay, allowlist });
}

function expectedArtifacts(manifest, allowlist) {
  const lastFrozen = manifest.migrations.at(-1)[0];
  return filesAt(sharedDir).map((file) => {
    if (file <= lastFrozen) throw new Error(`Migration 64+ must sort after ${lastFrozen}: ${file}`);
    return {
      file,
      supabase: render(file, "Supabase", supabaseOverlayDir, allowlist),
      cloudbase: render(file, "CloudBase", cloudbaseOverlayDir, allowlist),
    };
  });
}

function loadProviderManifest() {
  const manifest = JSON.parse(readFileSync(providerManifestPath, "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.migrations)) {
    throw new Error("Invalid provider-only migration manifest");
  }
  for (const entry of manifest.migrations) {
    const path = join(root, entry.provider, "migrations", entry.file);
    if (!existsSync(path))
      throw new Error(`Reviewed provider-only migration is missing: ${entry.file}`);
    const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (hash !== entry.sha256) throw new Error(`Provider-only migration changed: ${entry.file}`);
  }
  return manifest;
}

function checkInventory(bootstrap, providerManifest) {
  const shared = filesAt(sharedDir);
  assertMigrationInventory({
    frozen: bootstrap.migrations.map(([file]) => file),
    shared,
    supabase: filesAt(supabaseDir),
    cloudbase: filesAt(cloudbaseDir),
    providerOnly: providerManifest.migrations,
  });
  for (const [label, overlayDir] of [
    ["Supabase", supabaseOverlayDir],
    ["CloudBase", cloudbaseOverlayDir],
  ]) {
    const unmatched = filesAt(overlayDir).filter((file) => !shared.includes(file));
    if (unmatched.length)
      throw new Error(`${label} overlay lacks shared source: ${unmatched.join(", ")}`);
  }
}

function build() {
  const bootstrap = verifyBootstrapManifest();
  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  for (const artifact of expectedArtifacts(bootstrap, allowlist)) {
    writeFileSync(join(supabaseDir, artifact.file), artifact.supabase);
    writeFileSync(join(cloudbaseDir, artifact.file), artifact.cloudbase);
  }
  checkInventory(bootstrap, loadProviderManifest());
}

function check() {
  const bootstrap = verifyBootstrapManifest();
  const providerManifest = loadProviderManifest();
  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  checkInventory(bootstrap, providerManifest);
  for (const artifact of expectedArtifacts(bootstrap, allowlist)) {
    for (const provider of ["supabase", "cloudbase"]) {
      const target = join(provider === "supabase" ? supabaseDir : cloudbaseDir, artifact.file);
      if (!existsSync(target) || readFileSync(target, "utf8") !== artifact[provider]) {
        throw new Error(`Generated ${provider} migration drift: ${artifact.file}`);
      }
    }
  }
}

function createMigration() {
  const [version, ...nameParts] = process.argv.slice(3);
  const name = nameParts.join("_").replace(/[^a-z0-9_]/g, "");
  if (!/^\d{14}$/.test(version ?? "") || !name) {
    throw new Error("Usage: database-pg-migrations.mjs new <14-digit-version> <snake_case_name>");
  }
  const file = `${version}_${name}.sql`;
  mkdirSync(sharedDir, { recursive: true });
  const target = join(sharedDir, file);
  if (existsSync(target)) throw new Error(`Migration already exists: ${file}`);
  writeFileSync(target, `BEGIN;\n\n-- Provider-neutral schema change.\n\nCOMMIT;\n`);
  console.log(`Created ${target}`);
}

async function main() {
  const command = process.argv[2] ?? "check";
  if (command === "build") build();
  else if (command === "check") check();
  else if (command === "new") createMigration();
  else throw new Error(`Unknown command: ${command}`);
  if (command !== "new") console.log(`Migration 64+ ${command} passed.`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) await main();
