import { pathToFileURL } from "node:url";

import { readFirstJsonObject } from "./cloudbase-cli-json.mjs";

const failureMessage = "CloudBase Run deployment record verification failed.\n";

function identifier(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    value.trim() !== value ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    throw new Error();
  }
  return value;
}

function isPresent(value) {
  return (
    (typeof value === "string" && value.trim().length > 0) ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

export function inspectCloudBaseRunRecords(payload) {
  const records = payload?.data?.DeployRecords;
  if (!Array.isArray(records) || records.length === 0) throw new Error();

  const latest = records[0];
  if (!latest || typeof latest !== "object" || Array.isArray(latest)) throw new Error();
  return { latest, deployId: identifier(latest.DeployId) };
}

export function cloudBaseRunId(payload) {
  const { latest } = inspectCloudBaseRunRecords(payload);
  return identifier(latest.RunId);
}

function isReleased(latest) {
  return (
    latest.Status === "normal" &&
    latest.HasTraffic === true &&
    latest.FlowRatio === 100 &&
    latest.IsReleasing === false &&
    isPresent(latest.RunId) &&
    isPresent(latest.BuildId)
  );
}

export function classifyCloudBaseRunRecords(payload, previousDeployId) {
  const { latest, deployId } = inspectCloudBaseRunRecords(payload);
  if (deployId === previousDeployId) return "unchanged";
  if (isReleased(latest)) return "released";

  const status = typeof latest.Status === "string" ? latest.Status.toLowerCase() : "";
  if (/(?:^|_)failed$/.test(status) || ["error", "canceled", "cancelled"].includes(status)) {
    return "failed";
  }
  if (
    latest.IsReleasing === true ||
    ["building", "creating", "deploying", "normal", "pending", "releasing", "running"].includes(
      status,
    )
  ) {
    return "pending";
  }
  throw new Error();
}

export function assertCloudBaseRunBaseline(payload) {
  const { latest, deployId } = inspectCloudBaseRunRecords(payload);
  if (!isReleased(latest)) throw new Error();
  return deployId;
}

async function main() {
  const path = process.argv[2];
  const mode = process.argv[3];
  const previousDeployId = process.argv[4];
  if (
    !path ||
    !["baseline", "latest", "run-id", "state", "unchanged", "released"].includes(mode) ||
    (["latest", "run-id"].includes(mode) && previousDeployId !== undefined) ||
    (mode === "baseline" && previousDeployId !== undefined) ||
    (!["baseline", "latest", "run-id"].includes(mode) && (!previousDeployId || process.argv[5]))
  ) {
    throw new Error();
  }

  const payload = await readFirstJsonObject(path);
  const { latest, deployId: latestDeployId } = inspectCloudBaseRunRecords(payload);

  if (mode === "baseline") {
    process.stdout.write(`${assertCloudBaseRunBaseline(payload)}\n`);
    return;
  }

  if (mode === "latest") {
    process.stdout.write(`${latestDeployId}\n`);
    return;
  }
  if (mode === "run-id") {
    process.stdout.write(`${cloudBaseRunId(payload)}\n`);
    return;
  }
  if (mode === "state") {
    process.stdout.write(`${classifyCloudBaseRunRecords(payload, previousDeployId)}\n`);
    return;
  }
  if (mode === "unchanged") {
    if (latestDeployId !== previousDeployId) throw new Error();
    process.stdout.write("CloudBase Run did not register a deployment.\n");
    return;
  }

  if (latestDeployId === previousDeployId || !isReleased(latest)) {
    throw new Error();
  }

  process.stdout.write("CloudBase Run deployment is normal with 100% traffic.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write(failureMessage);
    process.exitCode = 1;
  });
}
