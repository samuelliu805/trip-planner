import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { prepareCloudBaseRun } from "./prepare-cloudbase-run.mjs";

const requiredFiles = [
  "Dockerfile",
  "package.json",
  "package-lock.json",
  "src/app.ts",
  "scripts/cloudbase-runtime-entrypoint.mjs",
  "scripts/public-template-build-lib.mjs",
  "scripts/validate-public-templates.mjs",
  "cloudbase/functions/shared/admin-cleanup.d.mts",
];
const deploymentEvidence = "docs/landing-evidence/assembled.png";
const artifactEvidence = "artifacts/landing-final/assembled.png";
const retainedDocumentation = "docs/operations-runbook.md";
const runtimeImport = "cloudbase/functions/shared/admin-cleanup.mjs";
const sourceTest = "src/app.test.ts";

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "prepare-cloudbase-run-"));
  for (const path of requiredFiles) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, `tracked:${path}`);
  }
  for (const path of [
    artifactEvidence,
    deploymentEvidence,
    retainedDocumentation,
    runtimeImport,
    sourceTest,
  ]) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, `tracked:${path}`);
  }
  writeFileSync(join(root, ".env.local"), "SECRET=must-not-copy");
  writeFileSync(join(root, "untracked.txt"), "must-not-copy");
  mkdirSync(join(root, ".cloudbase-run"), { recursive: true });
  writeFileSync(join(root, ".cloudbase-run/stale.txt"), "stale");
  return root;
}

test("copies only the supplied tracked source snapshot", (t) => {
  const root = createFixture();
  t.after(() => rmSync(root, { force: true, recursive: true }));

  const output = prepareCloudBaseRun(root, {
    trackedFiles: [
      ...requiredFiles,
      artifactEvidence,
      deploymentEvidence,
      retainedDocumentation,
      runtimeImport,
      sourceTest,
    ],
  });

  for (const path of requiredFiles) {
    assert.equal(readFileSync(join(output, path), "utf8"), `tracked:${path}`);
  }
  assert.equal(existsSync(join(output, ".env.local")), false);
  assert.equal(existsSync(join(output, "untracked.txt")), false);
  assert.equal(existsSync(join(output, "stale.txt")), false);
  assert.equal(existsSync(join(output, artifactEvidence)), false);
  assert.equal(existsSync(join(output, deploymentEvidence)), false);
  assert.equal(existsSync(join(output, retainedDocumentation)), false);
  assert.equal(existsSync(join(output, sourceTest)), false);
  assert.equal(readFileSync(join(output, runtimeImport), "utf8"), `tracked:${runtimeImport}`);
});

test("rejects a tracked path outside the project root", (t) => {
  const root = createFixture();
  t.after(() => rmSync(root, { force: true, recursive: true }));

  assert.throws(
    () => prepareCloudBaseRun(root, { trackedFiles: [...requiredFiles, "../outside"] }),
    /escaped the project root/,
  );
});

test("requires the complete source build contract", (t) => {
  const root = createFixture();
  t.after(() => rmSync(root, { force: true, recursive: true }));

  assert.throws(
    () =>
      prepareCloudBaseRun(root, {
        trackedFiles: requiredFiles.filter((path) => path !== "Dockerfile"),
      }),
    /requires Dockerfile/,
  );
});
