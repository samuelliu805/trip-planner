import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/phase-5-dual-environment.yml", import.meta.url);
const configUrl = new URL("../supabase/config.toml", import.meta.url);

test("Phase 5 verification is manual, exact-SHA, protected, and fail-closed", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /verification_gate == 'VERIFY'/);
  assert.equal(workflow.match(/test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/g)?.length, 3);
  assert.equal(workflow.match(/environment: cloudbase-pg-dev/g)?.length, 2);
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("Phase 5 static and live inventory stays executable", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  for (const command of [
    "npm run lint",
    "npm run typecheck",
    "npm run format:check",
    "npm run check:i18n",
    "npm test",
    "npm run check:backend-provider-boundary",
    "npm run check:maps-provider-boundary",
    "npm run check:cloudbase-pg-baseline",
    "npm run check:cloudbase-pg-rpc-surface",
    "npm run check:database-pg-migrations",
    "npm run check:phase-5-environment -- global",
    "npm run check:phase-5-environment -- cn",
    "npm run check:build-secret-boundary",
    "git diff --check",
    "supabase db reset --local --no-seed",
    "supabase test db --local",
    "node scripts/verify-vercel-preview-deployment.mjs",
    "npm run test:global-phase-5-live",
    "npm run test:supabase-phase-4-storage",
    "npm run test:cloudbase-phase-3-live",
    "npm run test:amap-phase-5-live",
    "npm run test:cloudbase-phase-4-storage",
    "npm run test:cloudbase-phase-4-cleanup",
  ]) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(workflow, /@cloudbase\/cli@3\.8\.1/);
  assert.match(workflow, /version: 2\.58\.5/);
  assert.match(workflow, /migration up[\s\\]*\n[\s\S]{0,100}--dry-run --json/);
  assert.match(workflow, /fn invoke trip-planner-cleanup/);
  assert.ok((workflow.match(/if: \$\{\{ always\(\) \}\}/g) ?? []).length >= 7);
});

test("the disposable Supabase target disables every public registration path", async () => {
  const config = await readFile(configUrl, "utf8");
  assert.match(config, /\[auth\][\s\S]*enable_signup = false/);
  assert.match(config, /enable_anonymous_sign_ins = false/);
  assert.match(config, /\[auth\.email\][\s\S]*enable_signup = false/);
  assert.match(config, /\[auth\.sms\][\s\S]*enable_signup = false/);
});
