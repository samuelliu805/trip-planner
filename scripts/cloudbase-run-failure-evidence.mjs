import { runCommand } from "./cloudbase-run-source-submitter.mjs";

function commandIdentifier(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return undefined;
  }
  return value;
}

export function redactCloudBaseDiagnosticOutput(output, environment = process.env) {
  let redacted = output
    .replace(
      /(["']?(?:x-cloudbase-context|authorization|secret(?:id|key)?|token|password)["']?\s*[:=]\s*)(["'])[^\r\n]*?\2/gi,
      "$1$2[REDACTED]$2",
    )
    .replace(
      /((?:x-cloudbase-context|authorization|secret(?:id|key)?|token|password)\s*[:=]\s*)[^\r\n,}]+/gi,
      "$1[REDACTED]",
    );
  for (const [key, value] of Object.entries(environment)) {
    if (
      !/(?:KEY|SECRET|TOKEN|PASSWORD|SECURITY_CODE|CREDENTIAL)/i.test(key) ||
      !value ||
      value.length < 4
    ) {
      continue;
    }
    redacted = redacted.split(value).join("[REDACTED]");
  }
  const maximum = 16 * 1024;
  return redacted.length > maximum
    ? `[earlier diagnostic output omitted]\n${redacted.slice(-maximum)}`
    : redacted;
}

async function printLog({ cli, envId, extraArguments = [], id, idFlag, logType, run, write }) {
  const result = await run(
    "npx",
    [
      ...cli,
      "cloudrun",
      "logs",
      logType,
      "--env-id",
      envId,
      idFlag,
      id,
      ...extraArguments,
      "--json",
    ],
    { capture: true, timeoutMs: 60_000 },
  );
  const output = [result.output, result.errorOutput].filter(Boolean).join("\n");
  if (result.code !== 0 || result.timedOut) {
    write(`CloudBase Run ${logType} log query failed${result.timedOut ? " (timed out)" : ""}.\n`);
  }
  if (output) {
    write(
      `--- CloudBase Run ${logType} evidence ---\n${redactCloudBaseDiagnosticOutput(output)}\n`,
    );
  }
}

export async function printCloudBaseFailureEvidence({
  cli,
  deployId,
  envId,
  record,
  run = runCommand,
  serviceName,
  write = (message) => process.stderr.write(message),
}) {
  const buildId = commandIdentifier(record?.BuildId);
  const runId = commandIdentifier(record?.RunId);
  const status = commandIdentifier(record?.Status) ?? "unknown";
  write(
    `Collecting failure evidence for deployment ${deployId} (status=${status}, buildId=${buildId ?? "missing"}, runId=${runId ?? "missing"}).\n`,
  );
  if (buildId) {
    await printLog({
      cli,
      envId,
      id: buildId,
      idFlag: "--build-id",
      logType: "build",
      extraArguments: ["--service-name", serviceName],
      run,
      write,
    });
  }
  if (runId) {
    await printLog({
      cli,
      envId,
      id: runId,
      idFlag: "--run-id",
      logType: "process",
      run,
      write,
    });
  }
}
