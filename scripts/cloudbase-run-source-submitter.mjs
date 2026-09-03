import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

import { parseFirstJsonObject } from "./cloudbase-cli-json.mjs";

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 10 * 1024 * 1024;

function signalProcess(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

export function runCommand(command, arguments_, { capture = false, cwd, timeoutMs }) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, arguments_, {
      cwd,
      detached: process.platform !== "win32",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    let errorOutput = "";
    let timedOut = false;
    let killTimer;
    for (const [stream, append] of [
      [child.stdout, (chunk) => (output += chunk)],
      [child.stderr, (chunk) => (errorOutput += chunk)],
    ]) {
      stream?.setEncoding("utf8");
      stream?.on("data", (chunk) => {
        append(chunk);
        if (output.length + errorOutput.length > MAX_CAPTURE_BYTES) signalProcess(child, "SIGTERM");
      });
    }
    const timeout = setTimeout(() => {
      timedOut = true;
      signalProcess(child, "SIGTERM");
      killTimer = setTimeout(() => signalProcess(child, "SIGKILL"), 30_000);
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      resolveCommand({ code, errorOutput, output, timedOut });
    });
  });
}

function boundedString(value, label, maximum = 512) {
  if (typeof value !== "string" || !value || value.length > maximum || /[\r\n]/.test(value)) {
    throw new Error(`CloudBase ${label} was invalid.`);
  }
  return value;
}

export function readCloudBaseBuildUpload(payload) {
  const response = payload?.Response ?? payload;
  const uploadUrl = boundedString(response?.UploadUrl, "upload URL", 8192);
  const parsedUrl = new URL(uploadUrl);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    (parsedUrl.port && parsedUrl.port !== "443")
  ) {
    throw new Error("CloudBase upload URL was not a clean HTTPS URL.");
  }
  if (!Array.isArray(response?.UploadHeaders) || response.UploadHeaders.length > 32) {
    throw new Error("CloudBase upload headers were invalid.");
  }
  const headers = response.UploadHeaders.map((header) => ({
    key: boundedString(header?.Key, "upload header name", 128),
    value: boundedString(header?.Value, "upload header value", 8192),
  }));
  if (headers.some(({ key }) => !/^[A-Za-z0-9-]+$/.test(key))) {
    throw new Error("CloudBase upload header name was invalid.");
  }
  return {
    headers,
    packageName: boundedString(response?.PackageName, "package name"),
    packageVersion: boundedString(response?.PackageVersion, "package version"),
    uploadUrl,
  };
}

export function cloudBaseRunUpdateBody({ envId, packageName, packageVersion, serviceName }) {
  return {
    DeployInfo: {
      DeployType: "package",
      PackageName: packageName,
      PackageVersion: packageVersion,
      ReleaseType: "FULL",
    },
    EnvId: envId,
    Items: [
      { IntValue: 8080, Key: "Port" },
      { ArrayValue: ["OA", "PUBLIC", "MINIAPP"], Key: "AccessTypes" },
    ],
    ServerName: serviceName,
  };
}

async function callCloudBaseApi({ action, body, cli, run, service, version }) {
  const envId = boundedString(body?.EnvId, "environment ID", 128);
  const arguments_ = [...cli, "--yes", "--env-id", envId, "api", service, action];
  if (version) arguments_.push("--api-version", version);
  arguments_.push("--body", JSON.stringify(body), "--json");
  const result = await run("npx", arguments_, { capture: true, timeoutMs: 60_000 });
  if (result.code !== 0 || result.timedOut) throw new Error(`CloudBase ${action} API call failed.`);
  return parseFirstJsonObject(result.output);
}

export async function prepareCloudBaseSourceArchive(source, { run = runCommand } = {}) {
  const sourcePath = resolve(source);
  const directory = await mkdtemp(`${tmpdir()}${sep}cloudbase-run-source-`);
  const archivePath = `${directory}${sep}source.zip`;
  try {
    const result = await run("zip", ["-9", "-q", "-r", archivePath, "."], {
      capture: true,
      cwd: sourcePath,
      timeoutMs: 120_000,
    });
    if (result.code !== 0 || result.timedOut)
      throw new Error("CloudBase source compression failed.");
    const { size } = await stat(archivePath);
    if (size < 1 || size > MAX_ARCHIVE_BYTES) {
      throw new Error("CloudBase source archive exceeded the approved size boundary.");
    }
    return {
      archivePath,
      archiveBytes: size,
      dispose: () => rm(directory, { force: true, recursive: true }),
    };
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    throw error;
  }
}

export async function submitCloudBaseRunSource({
  archivePath,
  cli,
  envId,
  run = runCommand,
  serviceName,
}) {
  const upload = readCloudBaseBuildUpload(
    await callCloudBaseApi({
      action: "DescribeCloudBaseBuildService",
      body: { EnvId: envId, ServiceName: serviceName },
      cli,
      run,
      service: "tcb",
    }),
  );
  const uploadResult = await run(
    "curl",
    [
      "--fail-with-body",
      "--silent",
      "--show-error",
      "--connect-timeout",
      "30",
      "--max-time",
      "300",
      "--request",
      "PUT",
      ...upload.headers.flatMap(({ key, value }) => ["--header", `${key}: ${value}`]),
      "--upload-file",
      archivePath,
      upload.uploadUrl,
    ],
    { capture: true, timeoutMs: 330_000 },
  );
  if (uploadResult.code !== 0 || uploadResult.timedOut) {
    throw new Error("CloudBase source archive upload failed.");
  }
  await callCloudBaseApi({
    action: "UpdateCloudRunServer",
    body: cloudBaseRunUpdateBody({ ...upload, envId, serviceName }),
    cli,
    run,
    service: "tcbr",
    version: "2022-02-17",
  });
}
