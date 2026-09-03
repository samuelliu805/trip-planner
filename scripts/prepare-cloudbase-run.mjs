import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");

function collectRuntimeDependencyFiles(directory, prefix = "") {
  const files = [];
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (relativePath.includes("\n")) {
      throw new Error("CloudBase runtime dependency path contained a newline.");
    }
    if (entry.isDirectory()) {
      files.push(...collectRuntimeDependencyFiles(join(directory, entry.name), relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

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
  rmSync(join(output, "node_modules/@img/sharp-linuxmusl-x64"), {
    force: true,
    recursive: true,
  });
  rmSync(join(output, "node_modules/@img/sharp-libvips-linuxmusl-x64"), {
    force: true,
    recursive: true,
  });
  const nodeModules = join(output, "node_modules");
  const runtimeDependencyFiles = collectRuntimeDependencyFiles(nodeModules);
  writeFileSync(
    join(output, "cloudbase-runtime-node-modules.txt"),
    `${runtimeDependencyFiles.join("\n")}\n`,
  );
  rmSync(nodeModules, { force: true, recursive: true });
  cpSync(join(projectRoot, "package-lock.json"), join(output, "package-lock.json"));
  cpSync(join(projectRoot, ".next/static"), join(output, ".next/static"), { recursive: true });
  if (existsSync(publicDirectory)) {
    cpSync(publicDirectory, join(output, "public"), { recursive: true });
  }
  cpSync(
    join(projectRoot, "scripts/cloudbase-runtime-entrypoint.mjs"),
    join(output, "cloudbase-runtime-entrypoint.mjs"),
  );
  cpSync(join(projectRoot, "cloudbase/run/Dockerfile"), join(output, "Dockerfile"));

  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = prepareCloudBaseRun(root);
  process.stdout.write(`Prepared ${output}\n`);
}
