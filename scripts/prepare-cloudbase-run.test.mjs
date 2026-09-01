import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { prepareCloudBaseRun } from "./prepare-cloudbase-run.mjs";

function createFixture({ publicAsset } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prepare-cloudbase-run-"));

  mkdirSync(join(root, ".next/standalone"), { recursive: true });
  mkdirSync(join(root, ".next/static/chunks"), { recursive: true });
  mkdirSync(join(root, "cloudbase/run"), { recursive: true });
  writeFileSync(join(root, ".next/standalone/server.js"), "server");
  writeFileSync(join(root, ".next/static/chunks/app.js"), "static");
  writeFileSync(join(root, "cloudbase/run/Dockerfile"), "FROM node:22-alpine\n");

  if (publicAsset) {
    mkdirSync(join(root, "public/assets"), { recursive: true });
    writeFileSync(join(root, "public/assets/logo.txt"), publicAsset);
  }

  return root;
}

test("prepares CloudBase Run output without a public directory", (t) => {
  const root = createFixture();
  t.after(() => rmSync(root, { force: true, recursive: true }));

  const output = prepareCloudBaseRun(root);

  assert.equal(readFileSync(join(output, "server.js"), "utf8"), "server");
  assert.equal(readFileSync(join(output, ".next/static/chunks/app.js"), "utf8"), "static");
  assert.equal(readFileSync(join(output, "Dockerfile"), "utf8"), "FROM node:22-alpine\n");
  assert.equal(existsSync(join(output, "public")), false);
});

test("copies real public assets when the public directory exists", (t) => {
  const root = createFixture({ publicAsset: "logo" });
  t.after(() => rmSync(root, { force: true, recursive: true }));

  const output = prepareCloudBaseRun(root);

  assert.equal(readFileSync(join(output, "public/assets/logo.txt"), "utf8"), "logo");
});
