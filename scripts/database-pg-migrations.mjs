import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root, verifyBootstrapManifest } from "./lib/cloudbase-pg-baseline-lib.mjs";

const sharedDir = join(root, "database/shared/migrations");
const supabaseOverlayDir = join(root, "database/supabase/overlays/migrations");
const cloudbaseOverlayDir = join(root, "database/cloudbase/overlays/migrations");
const supabaseDir = join(root, "supabase/migrations");
const cloudbaseDir = join(root, "cloudbase/migrations");

function filesAt(path) {
  return existsSync(path)
    ? readdirSync(path)
        .filter((name) => name.endsWith(".sql"))
        .sort()
    : [];
}

function render(file, provider, overlayDir) {
  const shared = readFileSync(join(sharedDir, file), "utf8").trim();
  const overlayPath = join(overlayDir, file);
  const pieces = [
    `-- Generated ${provider} migration from database/shared/migrations/${file}.`,
    "-- Edit the shared source and the minimal provider overlay, then rebuild.",
    shared,
  ];
  if (existsSync(overlayPath)) {
    pieces.push(`-- ${provider} provider overlay.`, readFileSync(overlayPath, "utf8").trim());
  }
  return `${pieces.join("\n\n")}\n`;
}

function expectedArtifacts() {
  const manifest = verifyBootstrapManifest();
  const lastFrozen = manifest.migrations.at(-1)[0];
  return filesAt(sharedDir).map((file) => {
    if (file <= lastFrozen) throw new Error(`Migration 64+ must sort after ${lastFrozen}: ${file}`);
    return {
      file,
      supabase: render(file, "Supabase", supabaseOverlayDir),
      cloudbase: render(file, "CloudBase", cloudbaseOverlayDir),
    };
  });
}

function build() {
  for (const artifact of expectedArtifacts()) {
    writeFileSync(join(supabaseDir, artifact.file), artifact.supabase);
    writeFileSync(join(cloudbaseDir, artifact.file), artifact.cloudbase);
  }
}

function check() {
  for (const artifact of expectedArtifacts()) {
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

const command = process.argv[2] ?? "check";
if (command === "build") build();
else if (command === "check") check();
else if (command === "new") createMigration();
else throw new Error(`Unknown command: ${command}`);

if (command !== "new") console.log(`Migration 64+ ${command} passed.`);
