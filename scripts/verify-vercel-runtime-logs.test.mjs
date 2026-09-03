import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("./verify-vercel-runtime-logs.mjs", import.meta.url);

function run(entries) {
  const directory = mkdtempSync(join(tmpdir(), "vercel-runtime-logs-"));
  try {
    const fixture = join(directory, "logs.jsonl");
    writeFileSync(fixture, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    return spawnSync(process.execPath, [script.pathname, fixture], { encoding: "utf8" });
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test("accepts bounded successful runtime entries", () => {
  const result = run([{ message: "GET /api/health", statusCode: 200 }]);
  assert.equal(result.status, 0, result.stderr);
});

test("rejects 5xx and CloudBase/ws runtime clusters", () => {
  assert.notEqual(run([{ message: "request failed", statusCode: 502 }]).status, 0);
  assert.notEqual(run([{ message: "缺少依赖 ws", statusCode: 200 }]).status, 0);
  assert.notEqual(run([{ message: "@cloudbase/js-sdk initialized", statusCode: 200 }]).status, 0);
});

test("fails closed when the CLI output is not JSON Lines", () => {
  const directory = mkdtempSync(join(tmpdir(), "vercel-runtime-logs-invalid-"));
  try {
    const fixture = join(directory, "logs.jsonl");
    writeFileSync(fixture, "not-json\n");
    const result = spawnSync(process.execPath, [script.pathname, fixture], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not JSON Lines/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
