import { pathToFileURL } from "node:url";

import { readFirstJsonObject } from "./cloudbase-cli-json.mjs";

function versionOf(entry) {
  const version = entry?.version ?? entry?.Version;
  return typeof version === "string" && /^\d{14}$/.test(version) ? version : "";
}

function migrationLabel(entry) {
  const version = versionOf(entry) || "unknown-version";
  const name = entry?.name ?? entry?.Name;
  return typeof name === "string" && /^[a-z0-9_]{1,100}$/.test(name)
    ? `${version}_${name}`
    : version;
}

export function verifyCloudBaseMigrationPlan(listPayload, planPayload, requiredVersions = []) {
  if (requiredVersions.some((version) => !/^\d{14}$/.test(version))) {
    throw new Error("CloudBase required migration version is invalid.");
  }
  const remote = listPayload?.data?.remote?.items;
  const plan = planPayload?.data;
  if (!Array.isArray(remote) || !plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("CloudBase migration verification returned an invalid bounded result.");
  }
  if (plan.dryRun !== true || plan.executable !== true || !Array.isArray(plan.pending)) {
    throw new Error("CloudBase migration dry-run was not executable.");
  }

  const appliedVersions = new Set(remote.map(versionOf).filter(Boolean));
  const missing = requiredVersions.filter((version) => !appliedVersions.has(version));
  const pending = plan.pending.map(migrationLabel);
  if (missing.length || pending.length) {
    const required = missing.length ? ` Required versions not applied: ${missing.join(", ")}.` : "";
    const waiting = pending.length ? ` Pending migrations: ${pending.join(", ")}.` : "";
    throw new Error(
      `CloudBase dev schema is not ready for the candidate.${required}${waiting} ` +
        "Apply the reviewed migrations through a separately approved dev change, then rerun Phase 5.",
    );
  }

  return { applied: appliedVersions.size };
}

export async function verifyCloudBaseMigrationPlanFiles(listPath, planPath, requiredVersions) {
  if (!listPath || !planPath) {
    throw new Error("CloudBase migration verification input is unavailable.");
  }
  const [listPayload, planPayload] = await Promise.all([
    readFirstJsonObject(listPath),
    readFirstJsonObject(planPath),
  ]);
  const result = verifyCloudBaseMigrationPlan(listPayload, planPayload, requiredVersions);
  process.stdout.write(
    `CloudBase migration dry-run is executable with zero pending migrations; ${result.applied} remote version(s) recorded.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyCloudBaseMigrationPlanFiles(
    process.argv[2],
    process.argv[3],
    process.argv.slice(4),
  ).catch((error) => {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "CloudBase migration verification failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
