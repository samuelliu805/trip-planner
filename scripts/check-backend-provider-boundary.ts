import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const productionExtension = /\.(?:[cm]?[jt]sx?)$/;
const sdkImports = [
  "@supabase/ssr",
  "@supabase/supabase-js",
  "@cloudbase/js-sdk",
  "@cloudbase/adapter-node",
  "@cloudbase/node-sdk",
  "@cloudbase/manager-node",
] as const;

export const providerSdkImportAllowlist = Object.freeze([
  "scripts/backfill-place-localities.ts",
  "scripts/lib/cloudbase-pg-live.mjs",
  "src/platform/supabase/admin.ts",
  "src/platform/cloudbase/client.ts",
  "src/platform/supabase/client.ts",
  "src/platform/supabase/proxy.ts",
  "src/platform/supabase/server.ts",
]);

export const providerPathImportAllowlist = Object.freeze([
  "src/lib/supabase/admin.ts",
  "src/lib/supabase/client.ts",
  "src/lib/supabase/config.ts",
  "src/lib/supabase/proxy.ts",
  "src/lib/supabase/server.ts",
]);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : Promise.resolve([path]);
    }),
  );
  return nested.flat();
}

export function directProviderSdkImports(source: string) {
  return sdkImports.filter((packageName) => {
    const escaped = packageName.replaceAll("/", "\\/");
    return new RegExp(
      `(?:from\\s+|import\\s*\\(\\s*|import\\s+|require\\s*\\(\\s*)["']${escaped}(?:["'/])`,
    ).test(source);
  });
}

export function directProviderPathImports(source: string) {
  const matches = source.matchAll(
    /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["'](@\/lib\/supabase(?:\/[A-Za-z0-9_.-]+)*|@\/platform\/(?:supabase|cloudbase)(?:\/[A-Za-z0-9_.-]+)*)["']/g,
  );
  return [...matches].map((match) => match[1]);
}

export async function findBackendProviderBoundaryViolations(root = process.cwd()) {
  const files = (
    await Promise.all([sourceFiles(resolve(root, "src")), sourceFiles(resolve(root, "scripts"))])
  )
    .flat()
    .filter((path) => productionExtension.test(path) && !/\.(?:test|spec)\.[^.]+$/.test(path));
  const allowed = new Set(providerSdkImportAllowlist);
  const allowedPaths = new Set(providerPathImportAllowlist);
  const violations: string[] = [];
  for (const path of files) {
    const projectPath = relative(root, path).replaceAll("\\", "/");
    const source = await readFile(path, "utf8");
    const imports = directProviderSdkImports(source);
    if (imports.length && !allowed.has(projectPath))
      violations.push(`${projectPath}: direct provider SDK import ${imports.join(", ")}`);
    const pathImports = directProviderPathImports(source);
    const providerAdapter = projectPath.startsWith("src/platform/");
    if (pathImports.length && !providerAdapter && !allowedPaths.has(projectPath)) {
      violations.push(`${projectPath}: direct provider path import ${pathImports.join(", ")}`);
    }
  }
  return violations;
}

async function main() {
  const violations = await findBackendProviderBoundaryViolations();
  if (violations.length) {
    process.stderr.write(`${violations.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Backend provider boundary check passed.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
