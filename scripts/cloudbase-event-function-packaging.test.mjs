import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readFileSync, statSync } from "node:fs";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("CloudBase cleanup Event Function packages its SCF entry boundary", () => {
  const config = JSON.parse(readFileSync(join(root, "cloudbaserc.json"), "utf8"));
  const cleanupFunction = config.functions.find(
    (candidate) => candidate.name === "trip-planner-cleanup",
  );

  assert.ok(cleanupFunction);
  assert.equal(cleanupFunction.handler, "index.main");
  assert.equal(cleanupFunction.dir, "cloudbase/functions");
  assert.doesNotMatch(cleanupFunction.handler, /[\\/]/);

  const deploymentDirectory = resolve(root, cleanupFunction.dir);
  const entry = require(join(deploymentDirectory, "index.js"));
  assert.equal(typeof entry.main, "function");

  for (const artifact of ["cleanup/index.mjs", "shared/admin-cleanup.mjs", "package.json"]) {
    const artifactPath = resolve(deploymentDirectory, artifact);
    const relativePath = relative(deploymentDirectory, artifactPath);
    assert.equal(isAbsolute(relativePath) || relativePath.startsWith(".."), false);
    assert.equal(statSync(artifactPath).isFile(), true);
  }
});
