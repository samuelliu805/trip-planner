import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const githubApiOrigin = "https://api.github.com";
const terminalFailureStates = new Set(["error", "failure", "inactive"]);

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
  const expectedSha = required("GITHUB_SHA", environment);
  const candidateSha = required("PHASE5_CANDIDATE_SHA", environment);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY is invalid.");
  }
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error("GITHUB_SHA is invalid.");
  if (candidateSha !== expectedSha) {
    throw new Error("PHASE5_CANDIDATE_SHA does not match GITHUB_SHA.");
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
        process.stdout.write(
          `Verified GitHub Vercel Preview deployment ${deployment.id} for ${expectedSha}.\n`,
        );
        if (environment.GITHUB_OUTPUT) {
          await appendFile(environment.GITHUB_OUTPUT, `url=${result.url}\n`);
        }
        return result.url;
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
