import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/phase-5-dual-environment.yml", import.meta.url);
const entryWorkflowUrl = new URL("../.github/workflows/cloudbase-pg-ci.yml", import.meta.url);
const configUrl = new URL("../supabase/config.toml", import.meta.url);
const cnApplicationSmokeUrl = new URL("./cloudbase-phase-3-app-e2e.mjs", import.meta.url);
const i18nCheckUrl = new URL("./check-i18n.mjs", import.meta.url);
const rootDockerfileUrl = new URL("../Dockerfile", import.meta.url);
const providerNeutralMigrationUrl = new URL(
  "../database/shared/migrations/20260901181000_provider_neutral_places_and_amap_public_routes.sql",
  import.meta.url,
);

test("Phase 5 verification is manual, exact-SHA, protected, and fail-closed", async () => {
  const [entryWorkflow, workflow] = await Promise.all([
    readFile(entryWorkflowUrl, "utf8"),
    readFile(workflowUrl, "utf8"),
  ]);
  assert.match(entryWorkflow, /workflow_dispatch:/);
  assert.match(entryWorkflow, /run_mode:[\s\S]*phase5/);
  assert.match(entryWorkflow, /verification_gate == 'VERIFY'/);
  assert.match(entryWorkflow, /uses: \.\/\.github\/workflows\/phase-5-dual-environment\.yml/);
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /verification_gate == 'VERIFY'/);
  assert.equal(
    workflow.match(/test "\$\(git rev-parse HEAD\)" = "\$PHASE5_CANDIDATE_SHA"/g)?.length,
    3,
  );
  assert.equal(workflow.match(/test "\$PHASE5_CANDIDATE_SHA" = "\$GITHUB_SHA"/g)?.length, 3);
  assert.equal(workflow.match(/ref: \$\{\{ inputs\.candidate_ref \}\}/g)?.length, 3);
  assert.equal(workflow.match(/environment: cloudbase-pg-dev/g)?.length, 2);
  assert.doesNotMatch(`${entryWorkflow}\n${workflow}`, /continue-on-error/);
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
    "supabase db start",
    "supabase test db --local",
    "node scripts/verify-vercel-preview-deployment.mjs",
    "npm run test:global-phase-5-live",
    "npm run test:supabase-phase-4-storage",
    "npm run test:cloudbase-phase-3-live",
    "npm run test:amap-phase-5-live",
    "npm run test:cloudbase-phase-4-storage",
    "npm run test:cloudbase-phase-4-cleanup",
    "node scripts/verify-cloudbase-migration-plan.mjs",
    "CLOUDBASE_CAM_SECRET_ID",
    "CLOUDBASE_CAM_SECRET_KEY",
    "VERCEL_AUTOMATION_BYPASS_SECRET",
    "tcb fn invoke",
    "--require-runtime-env NEXT_PUBLIC_AMAP_JS_API_KEY",
    "--require-runtime-env AMAP_JS_SECURITY_CODE",
    "--require-runtime-env AMAP_WEB_SERVICE_KEY",
  ]) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(workflow, /@cloudbase\/cli@3\.8\.1/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(
    workflow,
    /VERCEL_AUTOMATION_BYPASS_SECRET: \$\{\{ secrets\.VERCEL_AUTOMATION_BYPASS_SECRET \}\}/,
  );
  assert.doesNotMatch(workflow, /VERCEL_(?:TOKEN|ORG_ID|PROJECT_ID)/);
  assert.match(workflow, /version: 2\.116\.0/);
  assert.doesNotMatch(workflow, /supabase db reset/);
  assert.match(workflow, /migration up[\s\\]*\n[\s\S]{0,100}--dry-run --json/);
  assert.match(
    workflow,
    /verify-cloudbase-migration-plan\.mjs[\s\\]*\n[\s\S]{0,100}20260902075444/,
  );
  assert.match(workflow, /node scripts\/invoke-cloudbase-cleanup\.mjs "\$invocation_output"/);
  assert.match(workflow, /timeout 60s npx --yes --package @cloudbase\/cli@3\.8\.1 tcb fn invoke/);
  assert.match(workflow, /tcb logout[\s\\]*\n[\s\S]{0,50}--json > \/dev\/null/);
  assert.equal(workflow.match(/--cloudbase-api-key "\$CLOUDBASE_API_KEY"/g)?.length, 2);
  assert.match(workflow, /Restore the CloudBase database audit CLI identity/);
  assert.match(workflow, /CloudBase cleanup invocation configuration is incomplete\./);
  assert.match(workflow, /node scripts\/describe-cloudbase-cam-login\.mjs "\$cam_login_output"/);
  assert.match(workflow, /verify scf:GetFunction and scf:Invoke/);
  assert.ok(
    workflow.indexOf("Run real AMap route and place Web Service smoke") <
      workflow.indexOf("Run CN Auth, CRUD, RPC, RLS, share, cookie, header, and browser suite"),
  );
  assert.match(
    workflow,
    /Authenticate the CloudBase database audit CLI[\s\S]*Run private Storage[\s\S]*Invoke the deployed cleanup function[\s\S]*Restore the CloudBase database audit CLI identity[\s\S]*Independently execute cleanup and residue audit/,
  );
  assert.ok((workflow.match(/if: \$\{\{ always\(\) \}\}/g) ?? []).length >= 7);
});

test("the i18n check has no runner-specific file discovery dependency", async () => {
  const check = await readFile(i18nCheckUrl, "utf8");
  assert.doesNotMatch(check, /node:child_process|execFileSync|spawnSync|["']rg["']/);
  assert.match(check, /readdirSync/);
});

test("the root CloudBase image supports projects without public assets", async () => {
  const dockerfile = await readFile(rootDockerfileUrl, "utf8");
  assert.match(dockerfile, /COPY \. \.\nRUN mkdir -p public\nRUN APP_REGION=cn/);
  assert.match(dockerfile, /COPY --from=build[^\n]+\/app\/public \.\/public/);
});

test("the provider-neutral migration creates its private schema before private functions", async () => {
  const migration = await readFile(providerNeutralMigrationUrl, "utf8");
  const schema = migration.indexOf("CREATE SCHEMA IF NOT EXISTS app_private;");
  const privateFunction = migration.indexOf("CREATE FUNCTION app_private.");
  assert.ok(schema >= 0, "provider-neutral migration must initialize app_private from zero");
  assert.ok(
    schema < privateFunction,
    "app_private must exist before its first function is created",
  );
});

test("the disposable Supabase target disables every public registration path", async () => {
  const config = await readFile(configUrl, "utf8");
  assert.match(config, /\[auth\][\s\S]*enable_signup = false/);
  assert.match(config, /enable_anonymous_sign_ins = false/);
  assert.match(config, /\[auth\.email\][\s\S]*enable_signup = false/);
  assert.match(config, /\[auth\.sms\][\s\S]*enable_signup = false/);
});

test("the CN AMap smoke uses the real application UI and rejects Google requests", async () => {
  const smoke = await readFile(cnApplicationSmokeUrl, "utf8");
  assert.doesNotMatch(smoke, /window\.AMap\.(?:AutoComplete|PlaceSearch)/);
  for (const contract of [
    "addAmapActivityThroughUi",
    'li[role="option"]',
    'data-coordinate-system="wgs84"',
    "calculateAmapRouteThroughUi",
    "publishThroughUi",
    "public AMap route canvas",
    "/googleapis|maps\\.google|gstatic/i",
  ]) {
    assert.match(smoke, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
