import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const githubApiOrigin = "https://api.github.com";
const terminalFailureStates = new Set(["error", "failure", "inactive"]);
const releaseHeader = "x-trip-planner-release";

function required(name, environment = process.env) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required GitHub Preview verification value: ${name}`);
  return value;
}

export function selectExactPreviewDeployment(payload, expectedSha) {
  if (!Array.isArray(payload)) throw new Error("GitHub deployments response was invalid.");
  return payload.find(
    (candidate) =>
      candidate &&
      Number.isSafeInteger(candidate.id) &&
      candidate.sha === expectedSha &&
      candidate.environment === "Preview",
  );
}

export function classifyPreviewStatuses(payload) {
  if (!Array.isArray(payload)) throw new Error("GitHub deployment statuses response was invalid.");
  const latest = payload[0];
  if (!latest || typeof latest !== "object") return { state: "pending" };
  if (latest.state === "success") {
    const url = new URL(latest.environment_url);
    if (
      url.protocol !== "https:" ||
      !(url.hostname === "vercel.app" || url.hostname.endsWith(".vercel.app")) ||
      url.username ||
      url.password ||
      url.port
    ) {
      throw new Error("GitHub Preview deployment URL was not an approved Vercel HTTPS origin.");
    }
    return { state: "ready", url: url.origin };
  }
  if (terminalFailureStates.has(latest.state)) return { state: "failed" };
  return { state: "pending" };
}

function approvedVercelOrigin(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} was not an approved Vercel HTTPS origin.`);
  }
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "vercel.app" || url.hostname.endsWith(".vercel.app")) ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} was not an approved Vercel HTTPS origin.`);
  }
  return url.origin;
}

export function selectVercelPreviewCommentOrigin(payload) {
  if (!Array.isArray(payload)) throw new Error("GitHub Preview comments response was invalid.");
  const comments = [...payload].sort((left, right) =>
    String(right?.updated_at ?? "").localeCompare(String(left?.updated_at ?? "")),
  );
  for (const comment of comments) {
    if (
      comment?.user?.login !== "vercel[bot]" ||
      comment?.performed_via_github_app?.slug !== "vercel" ||
      typeof comment.body !== "string"
    )
      continue;
    for (const match of comment.body.matchAll(/\[Preview\]\((https:\/\/[^\s)]+)\)/gu)) {
      try {
        return approvedVercelOrigin(match[1], "Vercel bot Preview URL");
      } catch {
        // Ignore malformed or non-Vercel links even when they appear in a bot comment.
      }
    }
  }
  return undefined;
}

export function previewBrowserOrigin(environment, deploymentOrigin) {
  const configured = environment.PHASE5_GLOBAL_PREVIEW_URL?.trim();
  return configured
    ? approvedVercelOrigin(configured, "Configured Global Preview URL")
    : approvedVercelOrigin(deploymentOrigin, "GitHub Preview deployment URL");
}

export function previewCandidateOrigins(environment, deploymentOrigin, commentOrigin) {
  const exactDeployment = approvedVercelOrigin(deploymentOrigin, "GitHub Preview deployment URL");
  const configured = previewBrowserOrigin(environment, exactDeployment);
  const comment = commentOrigin
    ? approvedVercelOrigin(commentOrigin, "Vercel bot Preview URL")
    : undefined;
  return [...new Set([comment, configured, exactDeployment].filter(Boolean))];
}

export async function previewOriginMatchesExactSha(
  origin,
  expectedSha,
  environment = process.env,
  fetchImpl = fetch,
) {
  const bypassSecret = environment.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  const headers = bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : undefined;
  try {
    const response = await fetchImpl(new URL("/api/health", origin), {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status !== 200 || response.headers.get(releaseHeader) !== expectedSha)
      return false;
    const payload = await response.json();
    return (
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      Object.keys(payload).length === 1 &&
      payload.status === "ok"
    );
  } catch {
    return false;
  }
}

export function exactPreviewSha(environment = process.env) {
  const sourceSha = required("PHASE5_SOURCE_SHA", environment);
  const candidateSha = required("PHASE5_CANDIDATE_SHA", environment);
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("PHASE5_SOURCE_SHA is invalid.");
  if (candidateSha !== sourceSha) {
    throw new Error("PHASE5_CANDIDATE_SHA does not match PHASE5_SOURCE_SHA.");
  }
  return candidateSha;
}

async function githubJson(path, token) {
  const response = await fetch(`${githubApiOrigin}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub Preview lookup failed with ${response.status}.`);
  return response.json();
}

export async function verifyVercelPreview(environment = process.env) {
  const token = required("GITHUB_TOKEN", environment);
  const repository = required("GITHUB_REPOSITORY", environment);
  const expectedSha = exactPreviewSha(environment);
  const pullRequestNumber = environment.PHASE5_PULL_REQUEST_NUMBER?.trim();
  if (pullRequestNumber && !/^[1-9][0-9]*$/.test(pullRequestNumber)) {
    throw new Error("PHASE5_PULL_REQUEST_NUMBER is invalid.");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY is invalid.");
  }

  const deadline = Date.now() + 20 * 60 * 1_000;
  const encodedRepository = repository
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  while (Date.now() < deadline) {
    const deployments = await githubJson(
      `/repos/${encodedRepository}/deployments?ref=${expectedSha}&per_page=20`,
      token,
    );
    const deployment = selectExactPreviewDeployment(deployments, expectedSha);
    if (deployment) {
      const statuses = await githubJson(
        `/repos/${encodedRepository}/deployments/${deployment.id}/statuses?per_page=20`,
        token,
      );
      const result = classifyPreviewStatuses(statuses);
      if (result.state === "ready") {
        let commentOrigin;
        if (pullRequestNumber) {
          const comments = await githubJson(
            `/repos/${encodedRepository}/issues/${pullRequestNumber}/comments?per_page=100`,
            token,
          );
          commentOrigin = selectVercelPreviewCommentOrigin(comments);
          if (!commentOrigin) {
            process.stdout.write("Waiting for the Vercel bot stable Preview alias.\n");
            await new Promise((resolve) => setTimeout(resolve, 15_000));
            continue;
          }
        }
        let browserOrigin;
        const origins = previewCandidateOrigins(environment, result.url, commentOrigin);
        const browserOrigins = pullRequestNumber
          ? origins.filter((origin) => origin !== result.url)
          : origins;
        for (const origin of browserOrigins) {
          if (await previewOriginMatchesExactSha(origin, expectedSha, environment)) {
            browserOrigin = origin;
            break;
          }
        }
        if (!browserOrigin) {
          process.stdout.write(
            `Waiting for a verified Global Preview origin to serve ${expectedSha}.\n`,
          );
          await new Promise((resolve) => setTimeout(resolve, 15_000));
          continue;
        }
        process.stdout.write(
          `Verified GitHub Vercel Preview deployment ${deployment.id} and stable alias for ${expectedSha}.\n`,
        );
        if (environment.GITHUB_OUTPUT) {
          await appendFile(environment.GITHUB_OUTPUT, `url=${browserOrigin}\n`);
        }
        return browserOrigin;
      }
      if (result.state === "failed") {
        throw new Error(`GitHub Vercel Preview deployment ${deployment.id} failed.`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error(`Timed out waiting for a GitHub Vercel Preview for ${expectedSha}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyVercelPreview();
}
