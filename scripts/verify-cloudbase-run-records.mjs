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

async function main() {
  const path = process.argv[2];
  const mode = process.argv[3];
  const previousDeployId = process.argv[4];
  if (
    !path ||
    !["latest", "run-id", "unchanged", "released"].includes(mode) ||
    (["latest", "run-id"].includes(mode) && previousDeployId !== undefined) ||
    (!["latest", "run-id"].includes(mode) && (!previousDeployId || process.argv[5]))
  ) {
    throw new Error();
  }

  const payload = await readFirstJsonObject(path);
  const records = payload?.data?.DeployRecords;
  if (!Array.isArray(records) || records.length === 0) throw new Error();

  const latest = records[0];
  if (!latest || typeof latest !== "object" || Array.isArray(latest)) throw new Error();
  const latestDeployId = identifier(latest.DeployId);

  if (mode === "latest") {
    process.stdout.write(`${latestDeployId}\n`);
    return;
  }
  if (mode === "run-id") {
    process.stdout.write(`${identifier(latest.RunId)}\n`);
    return;
  }
  if (mode === "unchanged") {
    if (latestDeployId !== previousDeployId) throw new Error();
    process.stdout.write("CloudBase Run did not register a deployment.\n");
    return;
  }

  if (
    latestDeployId === previousDeployId ||
    latest.Status !== "normal" ||
    latest.HasTraffic !== true ||
    latest.FlowRatio !== 100 ||
    latest.IsReleasing !== false ||
    !isPresent(latest.RunId) ||
    !isPresent(latest.BuildId)
  ) {
    throw new Error();
  }

  process.stdout.write("CloudBase Run deployment is normal with 100% traffic.\n");
}

main().catch(() => {
  process.stderr.write(failureMessage);
  process.exitCode = 1;
});
