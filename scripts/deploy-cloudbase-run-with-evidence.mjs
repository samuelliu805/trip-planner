import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { parseFirstJsonObject } from "./cloudbase-cli-json.mjs";
import {
  prepareCloudBaseSourceArchive,
  runCommand,
  submitCloudBaseRunSource,
} from "./cloudbase-run-source-submitter.mjs";
import {
  assertCloudBaseRunBaseline,
  classifyCloudBaseRunRecords,
  cloudBaseRunId,
  inspectCloudBaseRunRecords,
} from "./verify-cloudbase-run-records.mjs";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForRelease({
  initialPayload,
  log,
  previousDeployId,
  queryRecords,
  releaseChecks,
  releasePollMs,
  waitImplementation,
}) {
  let payload = initialPayload;
  for (let check = 1; check <= releaseChecks; check += 1) {
    const state = classifyCloudBaseRunRecords(payload, previousDeployId);
    if (state === "released") {
      const { deployId } = inspectCloudBaseRunRecords(payload);
      return { deployId, runId: cloudBaseRunId(payload) };
    }
    if (state === "failed") {
      const { deployId } = inspectCloudBaseRunRecords(payload);
      log(`CloudBase Run deployment ${deployId} reached a terminal failure state.`);
      throw new Error("CloudBase Run registered a failed deployment.");
    }
    if (state !== "pending") throw new Error("CloudBase Run deployment state regressed.");
    if (check < releaseChecks) {
      await waitImplementation(releasePollMs);
      payload = await queryRecords();
    }
  }
  throw new Error("Timed out waiting for the registered CloudBase Run deployment.");
}

export async function deployCloudBaseRunWithEvidence({
  attempts = 3,
  deploy,
  log = () => undefined,
  queryRecords,
  registrationChecks = 13,
  registrationPollMs = 15_000,
  releaseChecks = 41,
  releasePollMs = 15_000,
  retryDelayMs = 30_000,
  waitImplementation = wait,
}) {
  if (
    !Number.isInteger(attempts) ||
    attempts < 1 ||
    !Number.isInteger(registrationChecks) ||
    registrationChecks < 1 ||
    !Number.isInteger(releaseChecks) ||
    releaseChecks < 1 ||
    typeof deploy !== "function" ||
    typeof queryRecords !== "function"
  ) {
    throw new TypeError("CloudBase Run deployment retry configuration was invalid.");
  }

  const previousDeployId = assertCloudBaseRunBaseline(await queryRecords());
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    log(`Submitting CloudBase Run deployment (attempt ${attempt}/${attempts}).`);
    const commandSucceeded = await deploy(attempt);

    for (let check = 1; check <= registrationChecks; check += 1) {
      const payload = await queryRecords();
      const state = classifyCloudBaseRunRecords(payload, previousDeployId);
      if (state !== "unchanged") {
        const { deployId } = inspectCloudBaseRunRecords(payload);
        log(`CloudBase Run registered deployment ${deployId}; retries are now disabled.`);
        return waitForRelease({
          initialPayload: payload,
          log,
          previousDeployId,
          queryRecords,
          releaseChecks,
          releasePollMs,
          waitImplementation,
        });
      }
      if (check < registrationChecks) await waitImplementation(registrationPollMs);
    }

    log(
      commandSucceeded
        ? "CloudBase source submission succeeded, but no new deployment record is visible yet."
        : "CloudBase source submission failed without registering a deployment.",
    );
    if (commandSucceeded) {
      throw new Error("CloudBase source submission succeeded without observable release evidence.");
    }
    if (attempt < attempts) await waitImplementation(retryDelayMs * attempt);
  }
  throw new Error("CloudBase Run did not register a deployment within the retry budget.");
}

function readArguments(arguments_) {
  const serviceIndex = arguments_.indexOf("--service-name");
  const sourceIndex = arguments_.indexOf("--source");
  const serviceName = arguments_[serviceIndex + 1];
  const source = arguments_[sourceIndex + 1];
  if (
    serviceIndex < 0 ||
    sourceIndex < 0 ||
    arguments_.length !== 4 ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(serviceName ?? "") ||
    !source
  ) {
    throw new Error();
  }
  return { serviceName, source };
}

async function main() {
  const envId = process.env.CLOUDBASE_ENV_ID?.trim();
  if (!envId || !/^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/.test(envId)) throw new Error();
  const { serviceName, source } = readArguments(process.argv.slice(2));
  const cli = ["--yes", "--package", "@cloudbase/cli@3.8.1", "tcb"];
  const queryRecords = async () => {
    const result = await runCommand(
      "npx",
      [
        ...cli,
        "cloudrun",
        "record",
        "list",
        "--env-id",
        envId,
        "--service-name",
        serviceName,
        "--json",
      ],
      { capture: true, timeoutMs: 60_000 },
    );
    if (result.code !== 0 || result.timedOut) throw new Error();
    return parseFirstJsonObject(result.output);
  };
  const archive = await prepareCloudBaseSourceArchive(source);
  process.stdout.write(`Prepared ${archive.archiveBytes}-byte CloudBase source archive.\n`);
  let result;
  try {
    result = await deployCloudBaseRunWithEvidence({
      deploy: async () => {
        try {
          await submitCloudBaseRunSource({
            archivePath: archive.archivePath,
            cli,
            envId,
            serviceName,
          });
          return true;
        } catch {
          process.stderr.write("CloudBase source submission failed before release evidence.\n");
          return false;
        }
      },
      log: (message) => process.stdout.write(`${message}\n`),
      queryRecords,
    });
  } finally {
    await archive.dispose();
  }
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `deployment_id=${result.deployId}\nrun_id=${result.runId}\n`,
    );
  }
  process.stdout.write(
    `CloudBase Run deployment ${result.deployId} is normal with 100% traffic.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("CloudBase Run deployment orchestration failed.\n");
    process.exitCode = 1;
  });
}
