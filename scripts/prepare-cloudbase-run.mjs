import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");

export function listTrackedProjectFiles(projectRoot) {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: projectRoot,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function checkedSourcePath(projectRoot, trackedPath) {
  if (
    typeof trackedPath !== "string" ||
    !trackedPath ||
    isAbsolute(trackedPath) ||
    trackedPath === ".cloudbase-run" ||
    trackedPath.startsWith(".cloudbase-run/")
  ) {
    throw new Error("CloudBase source snapshot contained an invalid tracked path.");
  }
  const source = resolve(projectRoot, trackedPath);
  const fromRoot = relative(projectRoot, source);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error("CloudBase source snapshot escaped the project root.");
  }
  if (!existsSync(source)) {
    throw new Error(`CloudBase tracked source was missing: ${trackedPath}`);
  }
  return source;
}

export function prepareCloudBaseRun(
  projectRoot,
  { trackedFiles = listTrackedProjectFiles(projectRoot) } = {},
) {
  const output = join(projectRoot, ".cloudbase-run");
  if (!Array.isArray(trackedFiles) || trackedFiles.length === 0) {
    throw new Error("CloudBase source snapshot had no tracked files.");
  }

  rmSync(output, { force: true, recursive: true });
  mkdirSync(output, { recursive: true });
  for (const trackedPath of trackedFiles) {
    const source = checkedSourcePath(projectRoot, trackedPath);
    const destination = join(output, trackedPath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
  }

  for (const requiredPath of [
    "Dockerfile",
    "package.json",
    "package-lock.json",
    "src",
    "scripts/cloudbase-runtime-entrypoint.mjs",
  ]) {
    if (!existsSync(join(output, requiredPath))) {
      throw new Error(`CloudBase source snapshot requires ${requiredPath}.`);
    }
  }
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = prepareCloudBaseRun(root);
  process.stdout.write(`Prepared tracked CloudBase source snapshot at ${output}\n`);
}
