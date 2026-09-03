import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { prepareCloudBaseRun } from "./prepare-cloudbase-run.mjs";

const muslSharpPackages = ["sharp-linuxmusl-x64", "sharp-libvips-linuxmusl-x64"];
const glibcSharpPackages = ["sharp-linux-x64", "sharp-libvips-linux-x64"];
const sourceSharpPackages = ["sharp-linux-x64"];

function createFixture({ includeMuslSharpPackages = true, publicAsset } = {}) {
  const root = mkdtempSync(join(tmpdir(), "prepare-cloudbase-run-"));

  mkdirSync(join(root, ".next/standalone"), { recursive: true });
  mkdirSync(join(root, ".next/static/chunks"), { recursive: true });
  mkdirSync(join(root, "cloudbase/run"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, ".next/standalone/server.js"), "server");
  writeFileSync(join(root, ".next/static/chunks/app.js"), "static");
  writeFileSync(join(root, "cloudbase/run/Dockerfile"), "FROM node:22-alpine\n");
  writeFileSync(join(root, "scripts/cloudbase-runtime-entrypoint.mjs"), "entrypoint");

  const fixtureSharpPackages = includeMuslSharpPackages
    ? [...muslSharpPackages, ...glibcSharpPackages]
    : glibcSharpPackages;
  for (const packageName of fixtureSharpPackages) {
    const packageDirectory = join(root, ".next/standalone/node_modules/@img", packageName);
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(join(packageDirectory, "package.json"), JSON.stringify({ name: packageName }));
  }
  mkdirSync(join(root, ".next/standalone/node_modules/sharp"), { recursive: true });
  writeFileSync(join(root, ".next/standalone/node_modules/sharp/package.json"), "sharp");

  if (publicAsset) {
    mkdirSync(join(root, "public/assets"), { recursive: true });
    writeFileSync(join(root, "public/assets/logo.txt"), publicAsset);
  }

  return root;
}

function assertSharpPackageSelection(output) {
  for (const packageName of [...muslSharpPackages, "sharp-libvips-linux-x64"]) {
    assert.equal(existsSync(join(output, "node_modules/@img", packageName)), false);
  }
  for (const packageName of sourceSharpPackages) {
    assert.equal(existsSync(join(output, "node_modules/@img", packageName, "package.json")), true);
  }
  assert.equal(existsSync(join(output, "node_modules/sharp/package.json")), true);
}

test("prepares CloudBase Run output without a public directory", (t) => {
  const root = createFixture();
  t.after(() => rmSync(root, { force: true, recursive: true }));

  const output = prepareCloudBaseRun(root);

  assert.equal(readFileSync(join(output, "server.js"), "utf8"), "server");
  assert.equal(readFileSync(join(output, ".next/static/chunks/app.js"), "utf8"), "static");
  assert.equal(readFileSync(join(output, "Dockerfile"), "utf8"), "FROM node:22-alpine\n");
  assert.equal(
    readFileSync(join(output, "cloudbase-runtime-entrypoint.mjs"), "utf8"),
    "entrypoint",
  );
  assert.equal(existsSync(join(output, "public")), false);
  assertSharpPackageSelection(output);
});

test("copies real public assets when the public directory exists", (t) => {
  const root = createFixture({ publicAsset: "logo" });
  t.after(() => rmSync(root, { force: true, recursive: true }));

  const output = prepareCloudBaseRun(root);

  assert.equal(readFileSync(join(output, "public/assets/logo.txt"), "utf8"), "logo");
  assertSharpPackageSelection(output);
});

test("tolerates missing optional musl Sharp package directories", (t) => {
  const root = createFixture({ includeMuslSharpPackages: false });
  t.after(() => rmSync(root, { force: true, recursive: true }));

  const output = prepareCloudBaseRun(root);

  assert.equal(readFileSync(join(output, "server.js"), "utf8"), "server");
  assertSharpPackageSelection(output);
});
