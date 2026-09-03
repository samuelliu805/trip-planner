import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const required = (name, environment = process.env) => {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required Vercel deployment verification value: ${name}`);
  return value;
};

export function selectExactProductionDeployment(payload, expectedSha) {
  if (!Array.isArray(payload?.deployments)) throw new Error("Vercel deployment list was invalid.");
  return payload.deployments.find(
    (candidate) => matchesExactGitSha(candidate, expectedSha) && candidate?.target === "production",
  );
}

function matchesExactGitSha(deployment, expectedSha) {
  const reportedShas = [deployment?.meta?.githubCommitSha, deployment?.gitSource?.sha].filter(
    (value) => typeof value === "string" && value.length > 0,
  );
  return reportedShas.length > 0 && reportedShas.every((value) => value === expectedSha);
}

function deploymentIdentifier(deployment) {
  const value = deployment?.id ?? deployment?.uid;
  if (typeof value !== "string" || !/^dpl_[A-Za-z0-9]+$/.test(value)) {
    throw new Error("Vercel deployment identifier was invalid.");
  }
  return value;
}

export function assertExactProductionDeploymentDetail(
  detail,
  selectedDeployment,
  projectId,
  expectedSha,
) {
  const selectedId = deploymentIdentifier(selectedDeployment);
  const detailId = deploymentIdentifier(detail);
  const detailProjectId = detail?.projectId ?? detail?.project?.id;
  if (
    detailId !== selectedId ||
    detailProjectId !== projectId ||
    detail?.target !== "production" ||
    (detail?.readyState ?? detail?.state) !== "READY" ||
    !matchesExactGitSha(detail, expectedSha)
  ) {
    throw new Error("Vercel deployment detail did not match the exact production candidate.");
  }
  return detailId;
}

export function exactProductionOrigin(detail, configuredSiteUrl) {
  let configured;
  try {
    configured = new URL(configuredSiteUrl);
  } catch {
    throw new Error("Global production site URL was invalid.");
  }
  if (
    configured.protocol !== "https:" ||
    configured.username ||
    configured.password ||
    configured.pathname !== "/" ||
    configured.search ||
    configured.hash ||
    !Array.isArray(detail?.alias) ||
    !detail.alias.includes(configured.hostname)
  ) {
    throw new Error("Global production site URL was not assigned to the exact deployment.");
  }
  return configured.origin;
}

export function assertGlobalEnvironmentKeys(payload) {
  if (!Array.isArray(payload?.envs))
    throw new Error("Vercel project environment list was invalid.");
  const forbidden = payload.envs
    .filter((entry) =>
      Array.isArray(entry?.target)
        ? entry.target.includes("production")
        : entry?.target === "production",
    )
    .map((entry) => entry?.key)
    .filter(
      (key) => typeof key === "string" && /CLOUDBASE|CN_PUBLIC_PHONE|(?:^|_)AMAP(?:_|$)/i.test(key),
    );
  if (forbidden.length) {
    throw new Error(`Global production has forbidden environment keys: ${forbidden.join(", ")}.`);
  }
}

export function assertExactHealth(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 1 ||
    payload.status !== "ok"
  )
    throw new Error("Global production health response was invalid.");
}

export function assertNoCloudBaseWarnings(events) {
  if (!Array.isArray(events)) throw new Error("Vercel deployment event list was invalid.");
  const warningFound = events.some((event) => {
    const text = typeof event?.payload?.text === "string" ? event.payload.text : "";
    return /@cloudbase|CloudBase|缺少依赖\s+ws|Cannot find module ['\"]ws/i.test(text);
  });
  if (warningFound) throw new Error("Global deployment logs contain a CloudBase/ws warning path.");
}

async function apiJson(path, { teamId, token }) {
  const url = new URL(path, "https://api.vercel.com");
  url.searchParams.set("teamId", teamId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Vercel verification request failed with ${response.status}.`);
  return response.json();
}

async function verifyRoutes(origin) {
  const health = await fetch(new URL("/api/health", origin), {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (health.status !== 200) throw new Error(`Global health route returned ${health.status}.`);
  assertExactHealth(await health.json());
  for (const [path, markers] of [
    ["/login", ["Welcome back", "Continue with Google"]],
    ["/signup", ["Create your account", "Email address"]],
  ]) {
    const response = await fetch(new URL(path, origin), {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    if (response.status !== 200 || markers.some((marker) => !body.includes(marker))) {
      throw new Error(`${path} did not return the expected Global auth page.`);
    }
  }
}

export async function verifyVercelGitDeployment(environment = process.env) {
  const token = required("VERCEL_TOKEN", environment);
  const projectId = required("VERCEL_PROJECT_ID", environment);
  const teamId = required("VERCEL_ORG_ID", environment);
  const expectedSha = required("DEPLOY_SHA", environment);
  const configuredSiteUrl = required("NEXT_PUBLIC_SITE_URL", environment);
  const deadline = Date.now() + 20 * 60_000;
  let deployment;
  while (Date.now() < deadline) {
    const list = await apiJson(
      `/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=20`,
      { teamId, token },
    );
    deployment = selectExactProductionDeployment(list, expectedSha);
    if (deployment?.state === "READY") break;
    if (deployment && ["ERROR", "CANCELED"].includes(deployment.state)) {
      throw new Error(`Vercel Git deployment ended in ${deployment.state}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  if (!deployment || deployment.state !== "READY") {
    throw new Error(`Timed out waiting for the Vercel Git deployment for ${expectedSha}.`);
  }

  const deploymentId = deploymentIdentifier(deployment);
  const detail = await apiJson(
    `/v13/deployments/${encodeURIComponent(deploymentId)}?withGitRepoInfo=true`,
    {
      teamId,
      token,
    },
  );
  assertExactProductionDeploymentDetail(detail, deployment, projectId, expectedSha);

  assertGlobalEnvironmentKeys(
    await apiJson(`/v9/projects/${encodeURIComponent(projectId)}/env`, { teamId, token }),
  );
  const origin = exactProductionOrigin(detail, configuredSiteUrl);
  await verifyRoutes(origin);
  assertNoCloudBaseWarnings(
    await apiJson(`/v3/deployments/${encodeURIComponent(deploymentId)}/events?follow=0&limit=200`, {
      teamId,
      token,
    }),
  );

  if (environment.GITHUB_OUTPUT) {
    await appendFile(environment.GITHUB_OUTPUT, `deployment_id=${deploymentId}\nurl=${origin}\n`);
  }
  process.stdout.write(`Verified exact-SHA Vercel production deployment ${deploymentId}.\n`);
  return { deploymentId, origin };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyVercelGitDeployment();
}
