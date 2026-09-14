import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { prepareStandaloneRuntime } from "./lib/standalone-runtime.mjs";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("the production start command uses the standalone runtime", () => {
  assert.equal(packageJson.scripts.start, "node --use-env-proxy scripts/start-standalone.mjs");
});

test("prepares the traced server with its public and static assets", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "trip-standalone-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await Promise.all([
    mkdir(join(root, ".next", "standalone"), { recursive: true }),
    mkdir(join(root, ".next", "static", "chunks"), { recursive: true }),
    mkdir(join(root, "public", "landing"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, ".next", "standalone", "server.js"), "// fixture"),
    writeFile(join(root, ".next", "static", "chunks", "app.js"), "static fixture"),
    writeFile(join(root, "public", "landing", "desk.webp"), "public fixture"),
  ]);

  const serverPath = await prepareStandaloneRuntime(root);

  assert.equal(serverPath, join(root, ".next", "standalone", "server.js"));
  assert.equal(
    await readFile(
      join(root, ".next", "standalone", ".next", "static", "chunks", "app.js"),
      "utf8",
    ),
    "static fixture",
  );
  assert.equal(
    await readFile(join(root, ".next", "standalone", "public", "landing", "desk.webp"), "utf8"),
    "public fixture",
  );
});

test("rejects an incomplete standalone build", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "trip-standalone-missing-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await assert.rejects(prepareStandaloneRuntime(root), /Run `npm run build` before starting/);
});
