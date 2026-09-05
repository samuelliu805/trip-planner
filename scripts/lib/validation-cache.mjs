import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readlink, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cacheVersion = 1;

async function gitOutput(root, args, encoding = "utf8") {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root,
    encoding,
    maxBuffer: 128 * 1024 * 1024,
  });
  return stdout;
}

async function hashWorktreeFiles(hash, root) {
  const output = await gitOutput(root, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  const paths = [...new Set(output.split("\0").filter(Boolean))].sort();
  for (const path of paths) {
    const absolutePath = resolve(root, path);
    try {
      const details = await lstat(absolutePath);
      hash.update(`path\0${path}\0${details.mode}\0`);
      hash.update(
        details.isSymbolicLink() ? await readlink(absolutePath) : await readFile(absolutePath),
      );
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      hash.update(`deleted\0${path}\0`);
    }
  }
}

export async function validationStateDirectory(root) {
  const gitDirectory = (await gitOutput(root, ["rev-parse", "--git-dir"])).trim();
  return resolve(root, gitDirectory, "trip-planner-validation");
}

export async function staticValidationFingerprint(root, environment = {}) {
  const hash = createHash("sha256");
  hash.update(`trip-planner-static-v${cacheVersion}\0`);
  hash.update(`${process.platform}\0${process.arch}\0${process.version}\0`);
  await hashWorktreeFiles(hash, root);

  try {
    hash.update(await readFile(resolve(root, "node_modules/.package-lock.json")));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    hash.update("node-modules-lock-missing");
  }

  for (const [name, value] of Object.entries(environment).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    hash.update(`${name}\0${value ?? ""}\0`);
  }
  return hash.digest("hex");
}

export async function readStaticValidationCache(stateDirectory) {
  try {
    const parsed = JSON.parse(await readFile(resolve(stateDirectory, "static.json"), "utf8"));
    return parsed.version === cacheVersion ? parsed : null;
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function writeStaticValidationCache(stateDirectory, fingerprint) {
  await mkdir(stateDirectory, { recursive: true });
  const target = resolve(stateDirectory, "static.json");
  const temporary = resolve(stateDirectory, `static-${process.pid}.tmp`);
  await writeFile(
    temporary,
    `${JSON.stringify({ completedAt: new Date().toISOString(), fingerprint, version: cacheVersion })}\n`,
    { mode: 0o600 },
  );
  await rename(temporary, target);
  return target;
}
