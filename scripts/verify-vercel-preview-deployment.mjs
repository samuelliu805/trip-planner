const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required Vercel Preview verification value: ${name}`);
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
  url.searchParams.set("limit", "50");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Vercel Preview lookup failed with ${response.status}.`);
  const payload = await response.json();
  const deployment = payload.deployments?.find(
    (candidate) =>
      candidate.meta?.githubCommitSha === expectedSha && candidate.target !== "production",
  );
  if (deployment?.state === "READY" && deployment.url) {
    const previewUrl = new URL(`https://${deployment.url}`).origin;
    process.stdout.write(
      `Verified Vercel Preview ${deployment.uid} for ${expectedSha} at ${previewUrl}.\n`,
    );
    if (process.env.GITHUB_OUTPUT) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(process.env.GITHUB_OUTPUT, `url=${previewUrl}\n`);
    }
    process.exit(0);
  }
  if (deployment && ["ERROR", "CANCELED"].includes(deployment.state)) {
    throw new Error(`Vercel Preview ${deployment.uid} ended in ${deployment.state}.`);
  }
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}

throw new Error(`Timed out waiting for a Vercel Preview for ${expectedSha}.`);
