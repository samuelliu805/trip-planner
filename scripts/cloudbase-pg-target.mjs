import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./lib/cloudbase-pg-baseline-lib.mjs";

const optionNames = new Map([
  ["--env-id", "CLOUDBASE_ENV_ID"],
  ["--region", "CLOUDBASE_REGION"],
  ["--instance-id", "CLOUDBASE_PG_INSTANCE_ID"],
]);

function argumentsByName() {
  const values = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const envName = optionNames.get(process.argv[index]);
    if (!envName || !process.argv[index + 1]) throw new Error("Invalid target arguments");
    values[envName] = process.argv[index + 1];
  }
  if (Object.keys(values).length !== optionNames.size) {
    throw new Error("Pass --env-id, --region and --instance-id explicitly");
  }
  return values;
}

function configuredTarget() {
  const selected = {};
  const envPath = join(root, ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const separator = line.indexOf("=");
      const name = line.slice(0, separator);
      if (separator < 1 || ![...optionNames.values()].includes(name)) continue;
      if (name in selected) throw new Error(`${name} is duplicated`);
      selected[name] = line.slice(separator + 1);
    }
  }
  for (const name of optionNames.values()) selected[name] = process.env[name] || selected[name];
  return selected;
}

const expected = argumentsByName();
const configured = configuredTarget();
for (const [name, value] of Object.entries(expected)) {
  if (!configured[name] || configured[name] !== value) throw new Error(`Target mismatch: ${name}`);
}

console.log(`Validated Env ID ${expected.CLOUDBASE_ENV_ID}.`);
console.log(`Validated region ${expected.CLOUDBASE_REGION}.`);
console.log(`Validated PG instance ${expected.CLOUDBASE_PG_INSTANCE_ID}.`);
