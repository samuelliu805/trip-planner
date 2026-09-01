const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required Vercel deployment verification value: ${name}`);
  return value;
};

const token = required("VERCEL_TOKEN");
const projectId = required("VERCEL_PROJECT_ID");
const teamId = required("VERCEL_ORG_ID");
const expectedSha = required("GITHUB_SHA");
const deadline = Date.now() + 20 * 60 * 1_000;

while (Date.now() < deadline) {
  const url = new URL("https://api.vercel.com/v6/deployments");
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("teamId", teamId);
  url.searchParams.set("target", "production");
  url.searchParams.set("limit", "20");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Vercel deployment lookup failed with ${response.status}.`);
  const payload = await response.json();
  const deployment = payload.deployments?.find(
    (candidate) => candidate.meta?.githubCommitSha === expectedSha,
  );
  if (deployment?.state === "READY") {
    process.stdout.write(`Verified Vercel Git deployment ${deployment.uid} for ${expectedSha}.\n`);
    process.exit(0);
  }
  if (deployment && ["ERROR", "CANCELED"].includes(deployment.state)) {
    throw new Error(`Vercel Git deployment ${deployment.uid} ended in ${deployment.state}.`);
  }
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}

throw new Error(`Timed out waiting for the Vercel Git deployment for ${expectedSha}.`);
