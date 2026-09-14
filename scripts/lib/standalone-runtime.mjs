import { constants } from "node:fs";
import { access, cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectoryIfPresent(source, destination) {
  if (!(await pathExists(source))) return;
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { force: true, recursive: true });
}

export async function prepareStandaloneRuntime(root = process.cwd()) {
  const standaloneRoot = join(root, ".next", "standalone");
  const serverPath = join(standaloneRoot, "server.js");
  if (!(await pathExists(serverPath))) {
    throw new Error("Missing .next/standalone/server.js. Run `npm run build` before starting.");
  }

  await Promise.all([
    copyDirectoryIfPresent(join(root, ".next", "static"), join(standaloneRoot, ".next", "static")),
    copyDirectoryIfPresent(join(root, "public"), join(standaloneRoot, "public")),
  ]);
  return serverPath;
}
