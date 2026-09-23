import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPreviewStatuses,
  exactPreviewSha,
  previewBrowserOrigin,
  previewCandidateOrigins,
  previewOriginMatchesExactSha,
  selectExactPreviewDeployment,
  selectVercelPreviewCommentOrigin,
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

test("uses only an approved configured stable Vercel Preview origin", () => {
  assert.equal(
    previewBrowserOrigin(
      { PHASE5_GLOBAL_PREVIEW_URL: " https://trip-planner-git-feature.example.vercel.app/ " },
      "https://random.example.vercel.app",
    ),
    "https://trip-planner-git-feature.example.vercel.app",
  );
  assert.equal(
    previewBrowserOrigin({}, "https://random.example.vercel.app"),
    "https://random.example.vercel.app",
  );
  for (const configured of [
    "http://trip-planner.example.vercel.app",
    "https://trip-planner.example.vercel.app/path",
    "https://vercel.app.attacker.invalid",
  ]) {
    assert.throws(
      () =>
        previewBrowserOrigin(
          { PHASE5_GLOBAL_PREVIEW_URL: configured },
          "https://random.example.vercel.app",
        ),
      /approved Vercel HTTPS origin/,
    );
  }
});

test("falls back to the exact deployment when a configured branch origin is stale", () => {
  assert.deepEqual(
    previewCandidateOrigins(
      { PHASE5_GLOBAL_PREVIEW_URL: "https://old-branch.vercel.app" },
      "https://exact-commit.vercel.app",
    ),
    ["https://old-branch.vercel.app", "https://exact-commit.vercel.app"],
  );
  assert.deepEqual(previewCandidateOrigins({}, "https://exact-commit.vercel.app"), [
    "https://exact-commit.vercel.app",
  ]);
});

test("prefers the current trusted Vercel bot branch alias", () => {
  const current = "https://trip-planner-git-codex-ideas-followup.example.vercel.app";
  assert.equal(
    selectVercelPreviewCommentOrigin([
      {
        body: `[Preview](${current})`,
        performed_via_github_app: { slug: "vercel" },
        updated_at: "2026-09-23T10:00:00Z",
        user: { login: "vercel[bot]" },
      },
      {
        body: "[Preview](https://attacker.example.vercel.app)",
        performed_via_github_app: { slug: "other" },
        updated_at: "2026-09-23T11:00:00Z",
        user: { login: "attacker" },
      },
    ]),
    current,
  );
  assert.deepEqual(
    previewCandidateOrigins(
      { PHASE5_GLOBAL_PREVIEW_URL: "https://old-branch.vercel.app" },
      "https://exact-commit.vercel.app",
      current,
    ),
    [current, "https://old-branch.vercel.app", "https://exact-commit.vercel.app"],
  );
  assert.throws(() => selectVercelPreviewCommentOrigin({}), /comments response was invalid/);
});

test("requires the controlled Preview origin to report the exact candidate SHA", async () => {
  const fetchOptions = [];
  const exact = await previewOriginMatchesExactSha(
    "https://trip-planner-git-feature.example.vercel.app",
    sha,
    { VERCEL_AUTOMATION_BYPASS_SECRET: "test-bypass" },
    async (_url, options) => {
      fetchOptions.push(options);
      return Response.json(
        { status: "ok" },
        { headers: { "X-Trip-Planner-Release": sha }, status: 200 },
      );
    },
  );
  assert.equal(exact, true);
  assert.equal(fetchOptions[0].headers["x-vercel-protection-bypass"], "test-bypass");
  assert.equal(
    await previewOriginMatchesExactSha(
      "https://trip-planner-git-feature.example.vercel.app",
      sha,
      {},
      async () =>
        Response.json(
          { status: "ok" },
          { headers: { "X-Trip-Planner-Release": "b".repeat(40) }, status: 200 },
        ),
    ),
    false,
  );
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
