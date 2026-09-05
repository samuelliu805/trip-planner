import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPreviewStatuses,
  exactPreviewSha,
  selectExactPreviewDeployment,
  verifyVercelPreview,
} from "./verify-vercel-preview-deployment.mjs";

const sha = "a".repeat(40);

test("selects only an exact-SHA GitHub Preview deployment", () => {
  const selected = selectExactPreviewDeployment(
    [
      { environment: "Production", id: 1, sha },
      { environment: "Preview", id: 2, sha: "b".repeat(40) },
      { environment: "Preview", id: 3, sha },
    ],
    sha,
  );
  assert.equal(selected?.id, 3);
});

test("accepts only a successful Vercel HTTPS deployment origin", () => {
  assert.deepEqual(
    classifyPreviewStatuses([
      { environment_url: "https://candidate.example.vercel.app/path", state: "success" },
    ]),
    { state: "ready", url: "https://candidate.example.vercel.app" },
  );
  for (const environmentUrl of [
    "http://candidate.example.vercel.app",
    "https://vercel.app.attacker.invalid",
    "https://user:password@candidate.example.vercel.app",
  ]) {
    assert.throws(
      () => classifyPreviewStatuses([{ environment_url: environmentUrl, state: "success" }]),
      /approved Vercel HTTPS origin/,
    );
  }
});

test("keeps pending states separate from terminal deployment failures", () => {
  assert.deepEqual(classifyPreviewStatuses([]), { state: "pending" });
  assert.deepEqual(classifyPreviewStatuses([{ state: "in_progress" }]), { state: "pending" });
  assert.deepEqual(classifyPreviewStatuses([{ state: "failure" }]), { state: "failed" });
});

test("uses the immutable source SHA even when a pull request workflow SHA differs", () => {
  assert.equal(
    exactPreviewSha({
      GITHUB_SHA: "b".repeat(40),
      PHASE5_CANDIDATE_SHA: sha,
      PHASE5_SOURCE_SHA: sha,
    }),
    sha,
  );
});

test("rejects a candidate SHA that differs from the immutable source SHA before lookup", async () => {
  await assert.rejects(
    () =>
      verifyVercelPreview({
        GITHUB_REPOSITORY: "owner/repository",
        GITHUB_TOKEN: "test-token",
        PHASE5_CANDIDATE_SHA: "b".repeat(40),
        PHASE5_SOURCE_SHA: sha,
      }),
    /does not match PHASE5_SOURCE_SHA/,
  );
});
