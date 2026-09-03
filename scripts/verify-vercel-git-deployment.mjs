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
    (candidate) =>
      candidate?.meta?.githubCommitSha === expectedSha && candidate?.target === "production",
  );
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

  const detail = await apiJson(`/v13/deployments/${encodeURIComponent(deployment.uid)}`, {
    teamId,
    token,
  });
  if (
    detail.uid !== deployment.uid ||
    detail.projectId !== projectId ||
    detail.target !== "production" ||
    (detail.readyState ?? detail.state) !== "READY" ||
    detail.meta?.githubCommitSha !== expectedSha
  )
    throw new Error("Vercel deployment detail did not match the exact production candidate.");

  assertGlobalEnvironmentKeys(
    await apiJson(`/v9/projects/${encodeURIComponent(projectId)}/env`, { teamId, token }),
  );
  const origin = new URL(`https://${detail.url}`).origin;
  await verifyRoutes(origin);
  assertNoCloudBaseWarnings(
    await apiJson(`/v3/deployments/${encodeURIComponent(detail.uid)}/events?follow=0&limit=200`, {
      teamId,
      token,
    }),
  );

  if (environment.GITHUB_OUTPUT) {
    await appendFile(environment.GITHUB_OUTPUT, `deployment_id=${detail.uid}\nurl=${origin}\n`);
  }
  process.stdout.write(`Verified exact-SHA Vercel production deployment ${detail.uid}.\n`);
  return { deploymentId: detail.uid, origin };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyVercelGitDeployment();
}
