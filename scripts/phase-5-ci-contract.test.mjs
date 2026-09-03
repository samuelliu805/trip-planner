import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/phase-5-dual-environment.yml", import.meta.url);
const entryWorkflowUrl = new URL("../.github/workflows/cloudbase-pg-ci.yml", import.meta.url);
const globalDeployUrl = new URL("../.github/workflows/deploy-global.yml", import.meta.url);
const cnDeployUrl = new URL("../.github/workflows/deploy-cn.yml", import.meta.url);
const cnProductionDeployUrl = new URL(
  "../.github/workflows/deploy-cn-production.yml",
  import.meta.url,
);
const observabilityWorkflowUrl = new URL(
  "../.github/workflows/observability-ci.yml",
  import.meta.url,
);
const configUrl = new URL("../supabase/config.toml", import.meta.url);
const cnApplicationSmokeUrl = new URL("./cloudbase-phase-3-app-e2e.mjs", import.meta.url);
const amapLiveSmokeUrl = new URL("./amap-phase-5-live.mjs", import.meta.url);
const globalLiveSmokeUrl = new URL("./global-phase-5-live.mjs", import.meta.url);
const globalBrowserSmokeUrl = new URL("./lib/phase-5-global-browser-smoke.mjs", import.meta.url);
const cnBrowserOriginUrl = new URL("./lib/phase-5-cn-browser-origin.mjs", import.meta.url);
const i18nCheckUrl = new URL("./check-i18n.mjs", import.meta.url);
const rootDockerfileUrl = new URL("../Dockerfile", import.meta.url);
const providerNeutralMigrationUrl = new URL(
  "../database/shared/migrations/20260901181000_provider_neutral_places_and_amap_public_routes.sql",
  import.meta.url,
);

test("Phase 6 verification is manual, exact-SHA, protected, and fail-closed", async () => {
  const [entryWorkflow, workflow] = await Promise.all([
    readFile(entryWorkflowUrl, "utf8"),
    readFile(workflowUrl, "utf8"),
  ]);
  assert.match(entryWorkflow, /workflow_dispatch:/);
  assert.match(entryWorkflow, /run_mode:[\s\S]*phase5[\s\S]*phase6/);
  assert.match(entryWorkflow, /\(inputs\.run_mode == 'phase5' \|\| inputs\.run_mode == 'phase6'\)/);
  assert.match(entryWorkflow, /verification_gate == 'VERIFY'/);
  assert.match(entryWorkflow, /uses: \.\/\.github\/workflows\/phase-5-dual-environment\.yml/);
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /verification_gate == 'VERIFY'/);
  assert.equal(
    workflow.match(/test "\$\(git rev-parse HEAD\)" = "\$PHASE5_CANDIDATE_SHA"/g)?.length,
    5,
  );
  assert.equal(workflow.match(/test "\$PHASE5_CANDIDATE_SHA" = "\$GITHUB_SHA"/g)?.length, 5);
  assert.equal(workflow.match(/ref: \$\{\{ inputs\.candidate_ref \}\}/g)?.length, 5);
  assert.equal(workflow.match(/environment: cloudbase-pg-dev/g)?.length, 2);
  assert.doesNotMatch(`${entryWorkflow}\n${workflow}`, /continue-on-error/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("Phase 6 static, isolated builds, and live inventory stay executable", async () => {
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
    "VERCEL_AUTOMATION_BYPASS_SECRET",
    "node scripts/invoke-cloudbase-cleanup-http.mjs",
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
  assert.doesNotMatch(workflow, /tcb fn invoke|CLOUDBASE_CAM_SECRET_/);
  assert.equal(workflow.match(/--cloudbase-api-key "\$CLOUDBASE_API_KEY"/g)?.length, 1);
  assert.match(workflow, /PHASE5_AMAP_ALLOWED_HOSTNAME:/);
  assert.ok(
    workflow.indexOf("Run real AMap route and place Web Service smoke") <
      workflow.indexOf("Run CN Auth, CRUD, RPC, RLS, share, cookie, header, and browser suite"),
  );
  assert.match(
    workflow,
    /Authenticate the CloudBase database audit CLI[\s\S]*Run private Storage[\s\S]*Invoke the deployed cleanup function[\s\S]*Independently execute cleanup and residue audit/,
  );
  assert.ok((workflow.match(/if: \$\{\{ always\(\) \}\}/g) ?? []).length >= 7);
});

test("Phase 6 deployment workflows are isolated, serialized, and evidence-backed", async () => {
  const [globalDeploy, cnDeploy, cnProductionDeploy, observability] = await Promise.all([
    readFile(globalDeployUrl, "utf8"),
    readFile(cnDeployUrl, "utf8"),
    readFile(cnProductionDeployUrl, "utf8"),
    readFile(observabilityWorkflowUrl, "utf8"),
  ]);

  assert.match(globalDeploy, /group: deploy-global-production/);
  assert.match(globalDeploy, /workflow_run:/);
  assert.match(globalDeploy, /workflow_run\.conclusion == 'success'/);
  assert.match(globalDeploy, /workflow_run\.head_branch == 'master'/);
  assert.match(globalDeploy, /github\.event\.workflow_run\.head_sha \|\| github\.sha/);
  assert.match(globalDeploy, /DEPLOY_SHA:/);
  assert.match(globalDeploy, /verify-vercel-git-deployment\.mjs/);
  assert.match(globalDeploy, /vercel@59\.11\.2 logs/);
  assert.match(globalDeploy, /verify-vercel-runtime-logs\.mjs/);
  assert.match(globalDeploy, /check:build-provider-isolation/);

  assert.match(cnDeploy, /workflow_run:/);
  assert.match(cnDeploy, /head_branch == 'master'/);
  assert.match(cnDeploy, /group: deploy-cn-dev-trip-planner-cn/);
  assert.match(cnDeploy, /CN_PUBLIC_PHONE_AUTH_ENABLED: "true"/);
  assert.match(cnDeploy, /verify-cloudbase-migration-plan\.mjs[\s\S]*--deployment 20260903180000/);
  assert.match(cnDeploy, /deploy-cloudbase-run-with-evidence\.mjs/);
  assert.doesNotMatch(cnDeploy, /sleep 10|deploy_cloudbase_run/);
  assert.match(cnDeploy, /cloudrun logs process/);
  assert.match(cnDeploy, /verify-cloudbase-runtime-logs\.mjs/);

  assert.match(cnProductionDeploy, /workflow_dispatch:/);
  assert.doesNotMatch(cnProductionDeploy, /push:|workflow_run:/);
  assert.match(cnProductionDeploy, /environment: cloudbase-cn-production/);
  assert.match(cnProductionDeploy, /DEPLOY_PRODUCTION/);
  assert.match(cnProductionDeploy, /ALERTS_RESTORE_SMS_ROLLBACK_READY/);
  assert.match(cnProductionDeploy, /ALERT_EVIDENCE/);
  assert.match(cnProductionDeploy, /RESTORE_DRILL_EVIDENCE/);
  assert.match(cnProductionDeploy, /SMS_READINESS_EVIDENCE/);
  assert.match(cnProductionDeploy, /CLOUDBASE_ROLLBACK_VERSION/);
  assert.match(cnProductionDeploy, /git merge-base --is-ancestor HEAD origin\/master/);
  assert.match(cnProductionDeploy, /deploy-cloudbase-run-with-evidence\.mjs/);
  assert.match(cnProductionDeploy, /cloudrun logs process/);

  assert.match(observability, /npm run test:telemetry/);
  assert.match(observability, /npm run check:auth-routes/);
  assert.doesNotMatch(observability, /npm run (?:lint|typecheck|build|test$)/m);
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
  const [browserOrigin, smoke] = await Promise.all([
    readFile(cnBrowserOriginUrl, "utf8"),
    readFile(cnApplicationSmokeUrl, "utf8"),
  ]);
  assert.doesNotMatch(smoke, /window\.AMap\.(?:AutoComplete|PlaceSearch)/);
  assert.doesNotMatch(smoke, /new URL\("\/_AMapService/);
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
  assert.match(
    smoke,
    /async function publishThroughUi\(browser, tripId\)[\s\S]*?await openTripMenu\(browser\);[\s\S]*?"Share trip menu item"[\s\S]*?button\.click\(\);[\s\S]*?"share publish activation"/,
  );
  assert.match(smoke, /bounded share-publish diagnostic/);
  assert.match(smoke, /loadPersistedShareCount\(tripId\)/);
  assert.match(smoke, /Close published share dialog/);
  assert.match(smoke, /share dialog close/);
  assert.match(smoke, /share\/\$\{publicToken\}\?view=timeline/);
  assert.match(smoke, /"B trip access denial"/);
  assert.match(smoke, /deniedTripBody\.includes\(updatedTitle\), false/);
  assert.match(smoke, /const response = await fetch\(\$\{JSON\.stringify\(path\)\}/);
  assert.doesNotMatch(smoke, /new URL\(path, baseUrl\)\.href/);
  assert.match(smoke, /visibleFrozenTop = Math\.max\(frozenRect\.top, headerRect\.bottom \+ 1\)/);
  assert.match(
    smoke,
    /querySelectorAll\('\[data-cell="0-1"\] \[data-edit-item\]'\)[\s\S]*?getClientRects\(\)\.length[\s\S]*?"first refreshed saved activity"/,
  );
  assert.match(browserOrigin, /trip-planner-cn-306129-11-1253819205\.sh\.run\.tcloudbase\.com/);
  assert.match(browserOrigin, /--host-resolver-rules=MAP/);
  assert.match(browserOrigin, /loopbackHostnames/);
});

test("live preflights distinguish provider schema and AMap key contracts", async () => {
  const [amapSmoke, globalSmoke, globalBrowserSmoke] = await Promise.all([
    readFile(amapLiveSmokeUrl, "utf8"),
    readFile(globalLiveSmokeUrl, "utf8"),
    readFile(globalBrowserSmokeUrl, "utf8"),
  ]);
  assert.match(amapSmoke, /required\("NEXT_PUBLIC_AMAP_JS_API_KEY"\)/);
  assert.match(amapSmoke, /required\("AMAP_JS_SECURITY_CODE"\)/);
  assert.match(amapSmoke, /required\("AMAP_WEB_SERVICE_KEY"\)/);
  assert.match(amapSmoke, /web-service-key-platform-mismatch/);
  assert.match(amapSmoke, /assert\.notEqual\(\s*browserKey,\s*key/);
  assert.match(amapSmoke, /boundedRetryFetch/);
  assert.match(amapSmoke, /attempts: 6/);
  assert.match(amapSmoke, /timeoutMs: 15_000/);
  assert.doesNotMatch(amapSmoke, /searchParams\.set\("key", browserKey\)/);
  assert.doesNotMatch(amapSmoke, /searchParams\.set\("jscode"/);
  assert.match(globalSmoke, /select\("source,provider_place_id,coordinate_system"\)/);
  assert.match(globalBrowserSmoke, /async function submitGlobalLogin/);
  assert.match(globalBrowserSmoke, /form\.requestSubmit\(\)/);
  assert.match(globalBrowserSmoke, /bounded login diagnostic/);
});
