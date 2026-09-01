import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, ".cloudbase-run");
const standalone = join(root, ".next/standalone");

if (!existsSync(join(standalone, "server.js"))) {
  throw new Error("Build the standalone Next.js application before preparing CloudBase Run.");
}

rmSync(output, { force: true, recursive: true });
mkdirSync(output, { recursive: true });
cpSync(standalone, output, { recursive: true });
cpSync(join(root, ".next/static"), join(output, ".next/static"), { recursive: true });
cpSync(join(root, "public"), join(output, "public"), { recursive: true });
cpSync(join(root, "cloudbase/run/Dockerfile"), join(output, "Dockerfile"));
process.stdout.write(`Prepared ${output}\n`);
