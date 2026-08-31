import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const productionExtension = /\.(?:[cm]?[jt]sx?)$/;
const sdkImports = [
  "@supabase/ssr",
  "@supabase/supabase-js",
  "@cloudbase/js-sdk",
  "@cloudbase/node-sdk",
  "@cloudbase/manager-node",
] as const;

export const providerSdkImportAllowlist = Object.freeze([
  "scripts/backfill-place-localities.ts",
  "src/platform/supabase/admin.ts",
  "src/platform/supabase/client.ts",
  "src/platform/supabase/proxy.ts",
  "src/platform/supabase/server.ts",
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

export async function findBackendProviderBoundaryViolations(root = process.cwd()) {
  const files = (
    await Promise.all([sourceFiles(resolve(root, "src")), sourceFiles(resolve(root, "scripts"))])
  )
    .flat()
    .filter((path) => productionExtension.test(path) && !/\.(?:test|spec)\.[^.]+$/.test(path));
  const allowed = new Set(providerSdkImportAllowlist);
  const violations: string[] = [];
  for (const path of files) {
    const projectPath = relative(root, path).replaceAll("\\", "/");
    const imports = directProviderSdkImports(await readFile(path, "utf8"));
    if (imports.length && !allowed.has(projectPath))
      violations.push(`${projectPath}: direct provider SDK import ${imports.join(", ")}`);
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
