import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) throw new Error("Usage: node scripts/verify-cloudbase-run-detail.mjs <detail.json>");

const payload = JSON.parse(await readFile(path, "utf8"));
const statuses = [];
function visit(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(status|state)$/i.test(key) && typeof child === "string") statuses.push(child);
    visit(child);
  }
}
visit(payload);
if (!statuses.some((status) => status.toLowerCase() === "normal")) {
  throw new Error("CloudBase Run detail did not report Status=normal.");
}
process.stdout.write("CloudBase Run reports Status=normal.\n");
