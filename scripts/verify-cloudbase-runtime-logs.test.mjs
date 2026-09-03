import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./verify-cloudbase-runtime-logs.mjs", import.meta.url));

async function run(payload) {
  const directory = await mkdtemp(join(tmpdir(), "cloudbase-runtime-logs-"));
  const path = join(directory, "logs.json");
  await writeFile(path, JSON.stringify(payload));
  const result = spawnSync(process.execPath, [script, path], { encoding: "utf8" });
  await rm(directory, { force: true, recursive: true });
  return result;
}

test("accepts a healthy CloudBase runtime log", async () => {
  const result = await run({ Logs: ["container started", "GET /api/health 200"] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no error clusters \(2 lines\)/);
});

test("rejects runtime errors without replaying log content", async () => {
  const secret = "do-not-print-runtime-secret";
  const result = await run({ Logs: [`Unhandled ERROR ${secret}`] });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes(secret), false);
});

test("fails closed on malformed output", async () => {
  const result = await run({ data: [] });
  assert.equal(result.status, 1);
});
