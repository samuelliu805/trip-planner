import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { parseFirstJsonObject } from "./cloudbase-cli-json.mjs";
import {
  printCloudBaseFailureEvidence,
  redactCloudBaseDiagnosticOutput,
} from "./cloudbase-run-failure-evidence.mjs";
import {
  prepareCloudBaseSourceArchive,
  runCommand,
  submitCloudBaseRunSource,
} from "./cloudbase-run-source-submitter.mjs";
import {
  assertCloudBaseRunSubmissionBaseline,
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
      return { state, deployId, runId: cloudBaseRunId(payload) };
    }
    if (state === "failed") {
      const { deployId, latest } = inspectCloudBaseRunRecords(payload);
      log(`CloudBase Run deployment ${deployId} reached a terminal failure state.`);
      return { state, deployId, record: latest };
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
  onFailedDeployment = async () => undefined,
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
    typeof queryRecords !== "function" ||
    typeof onFailedDeployment !== "function"
  ) {
    throw new TypeError("CloudBase Run deployment retry configuration was invalid.");
  }

  let previousDeployId = assertCloudBaseRunSubmissionBaseline(await queryRecords());
  submissionAttempts: for (let attempt = 1; attempt <= attempts; attempt += 1) {
    log(`Submitting CloudBase Run deployment (attempt ${attempt}/${attempts}).`);
    const commandSucceeded = await deploy(attempt);

    for (let check = 1; check <= registrationChecks; check += 1) {
      const payload = await queryRecords();
      const state = classifyCloudBaseRunRecords(payload, previousDeployId);
      if (state !== "unchanged") {
        const { deployId } = inspectCloudBaseRunRecords(payload);
        log(`CloudBase Run registered deployment ${deployId}; waiting for its terminal state.`);
        const outcome = await waitForRelease({
          initialPayload: payload,
          log,
          previousDeployId,
          queryRecords,
          releaseChecks,
          releasePollMs,
          waitImplementation,
        });
        if (outcome.state === "released") {
          return { deployId: outcome.deployId, runId: outcome.runId };
        }
        try {
          await onFailedDeployment({
            attempt,
            deployId: outcome.deployId,
            record: outcome.record,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log(`CloudBase Run failure evidence collection failed: ${message}`);
        }
        if (attempt === attempts) {
          throw new Error(
            `CloudBase Run deployment ${outcome.deployId} failed on the final attempt.`,
          );
        }
        previousDeployId = outcome.deployId;
        log(`Retrying the same CloudBase source archive after deployment ${outcome.deployId}.`);
        await waitImplementation(retryDelayMs * attempt);
        continue submissionAttempts;
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
            log: (message) => process.stdout.write(`${message}\n`),
            serviceName,
          });
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          process.stderr.write(
            `CloudBase source submission failed before release evidence: ${redactCloudBaseDiagnosticOutput(message)}\n`,
          );
          return false;
        }
      },
      log: (message) => process.stdout.write(`${message}\n`),
      onFailedDeployment: async ({ deployId, record }) => {
        await printCloudBaseFailureEvidence({ cli, deployId, envId, record, serviceName });
      },
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
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `CloudBase Run deployment orchestration failed: ${redactCloudBaseDiagnosticOutput(message)}\n`,
    );
    process.exitCode = 1;
  });
}
