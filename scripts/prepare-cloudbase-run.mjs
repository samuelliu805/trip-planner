import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");

export function prepareCloudBaseRun(projectRoot) {
  const output = join(projectRoot, ".cloudbase-run");
  const standalone = join(projectRoot, ".next/standalone");
  const publicDirectory = join(projectRoot, "public");

  if (!existsSync(join(standalone, "server.js"))) {
    throw new Error("Build the standalone Next.js application before preparing CloudBase Run.");
  }

  rmSync(output, { force: true, recursive: true });
  mkdirSync(output, { recursive: true });
  cpSync(standalone, output, { recursive: true });
  cpSync(join(projectRoot, ".next/static"), join(output, ".next/static"), { recursive: true });
  if (existsSync(publicDirectory)) {
    cpSync(publicDirectory, join(output, "public"), { recursive: true });
  }
  cpSync(join(projectRoot, "cloudbase/run/Dockerfile"), join(output, "Dockerfile"));

  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = prepareCloudBaseRun(root);
  process.stdout.write(`Prepared ${output}\n`);
}
