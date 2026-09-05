import { resolve } from "node:path";

import { compactCommand } from "./lib/compact-command.mjs";
import { validationStateDirectory } from "./lib/validation-cache.mjs";

const root = resolve(import.meta.dirname, "..");
const separator = process.argv.indexOf("--");
const labelIndex = process.argv.indexOf("--label");
const label = labelIndex >= 0 ? process.argv[labelIndex + 1] : null;
const command = separator >= 0 ? process.argv.slice(separator + 1) : [];

if (!label || !command.length) {
  process.stderr.write(
    'Usage: node scripts/run-compact-command.mjs --label "description" -- command [args...]\n',
  );
  process.exitCode = 2;
} else {
  try {
    const stateDirectory = await validationStateDirectory(root);
    await compactCommand({
      args: command.slice(1),
      cwd: root,
      env: process.env,
      executable: command[0],
      label,
      logDirectory: resolve(stateDirectory, "logs"),
    });
  } catch (error) {
    if (!error?.compactCommandReported) process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = error?.exitCode ?? 1;
  }
}
