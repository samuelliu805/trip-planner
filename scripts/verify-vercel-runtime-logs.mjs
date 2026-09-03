import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path || process.argv[3]) throw new Error("Expected one bounded Vercel log file.");
const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
let relevant = 0;
for (const line of lines) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    throw new Error("Vercel runtime log output was not JSON Lines.");
  }
  const message = typeof entry?.message === "string" ? entry.message : "";
  const status = Number(entry?.statusCode ?? entry?.status);
  if (
    status >= 500 ||
    /@cloudbase|CloudBase|缺少依赖\s+ws|Cannot find module ['\"]ws/i.test(message)
  ) {
    relevant += 1;
  }
}
if (relevant) throw new Error(`Vercel runtime log scan found ${relevant} relevant error(s).`);
process.stdout.write(`Vercel runtime log scan passed (${lines.length} bounded entries).\n`);
