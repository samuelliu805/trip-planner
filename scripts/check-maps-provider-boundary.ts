import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const productionExtension = /\.(?:ts|tsx)$/;
const googleBoundary = "src/lib/providers/google/";
const amapBoundary = "src/lib/providers/amap/";
const googleForbidden = [
  { label: "@vis.gl/react-google-maps import", pattern: /@vis\.gl\/react-google-maps/ },
  { label: "Google Maps browser SDK type", pattern: /\bgoogle\.maps\b/ },
] as const;
const amapForbidden = [
  { label: "AMap browser SDK package", pattern: /@amap\// },
  {
    label: "AMap browser SDK global",
    pattern: /(?:window|globalThis)\.AMap\b|\bdeclare\s+(?:const|namespace)\s+AMap\b/,
  },
  { label: "AMap security global", pattern: /_AMapSecurityConfig/ },
] as const;

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

export async function findMapsProviderBoundaryViolations(root = process.cwd()) {
  const src = resolve(root, "src");
  const files = (await sourceFiles(src)).filter(
    (path) => productionExtension.test(path) && !/\.(?:test|spec)\.[^.]+$/.test(path),
  );
  const violations: string[] = [];
  for (const path of files) {
    const projectPath = relative(root, path).replaceAll("\\", "/");
    const source = await readFile(path, "utf8");
    if (!projectPath.startsWith(googleBoundary))
      for (const rule of googleForbidden)
        if (rule.pattern.test(source)) violations.push(`${projectPath}: ${rule.label}`);
    if (!projectPath.startsWith(amapBoundary))
      for (const rule of amapForbidden)
        if (rule.pattern.test(source)) violations.push(`${projectPath}: ${rule.label}`);
  }
  return violations;
}

async function main() {
  const violations = await findMapsProviderBoundaryViolations();
  if (violations.length) {
    process.stderr.write(`${violations.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Maps provider boundary check passed.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
