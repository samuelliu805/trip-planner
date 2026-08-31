import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const secretNames = [
  "SUPABASE_SECRET_KEY",
  "CRON_SECRET",
  "GOOGLE_PLACES_API_KEY",
  "GOOGLE_ROUTES_API_KEY",
  "CLOUDBASE_SECRET_ID",
  "CLOUDBASE_SECRET_KEY",
  "CLOUDBASE_PUBLISHABLE_KEY",
];

async function filesBelow(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return filesBelow(path);
      return Promise.resolve(entry.isFile() ? [path] : []);
    }),
  );
  return nested.flat();
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  )
    return trimmed.slice(1, -1);
  return trimmed;
}

async function localSecretValues() {
  const values = secretNames.map((name) => process.env[name]).filter(Boolean);
  const envFile = resolve(".env.local");
  if (!existsSync(envFile)) return values;
  const source = await readFile(envFile, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || !secretNames.includes(match[1])) continue;
    const value = unquote(match[2]);
    if (value) values.push(value);
  }
  return [...new Set(values.filter((value) => value.length >= 8))];
}

async function containing(files, needles) {
  const hits = [];
  for (const path of files) {
    const content = await readFile(path);
    if (needles.some((needle) => content.includes(Buffer.from(needle)))) hits.push(path);
  }
  return hits;
}

const buildFiles = await filesBelow(resolve(".next"));
if (!buildFiles.length) throw new Error("No .next build output was found.");
const clientFiles = await filesBelow(resolve(".next/static"));
const [clientNameHits, buildValueHits] = await Promise.all([
  containing(clientFiles, secretNames),
  containing(buildFiles, await localSecretValues()),
]);

process.stdout.write(`Client admin/server secret-name hits: ${clientNameHits.length}\n`);
process.stdout.write(`Build admin/server secret-value hits: ${buildValueHits.length}\n`);
if (clientNameHits.length || buildValueHits.length) {
  const paths = [...new Set([...clientNameHits, ...buildValueHits])];
  process.stderr.write(`${paths.join("\n")}\n`);
  process.exitCode = 1;
}
