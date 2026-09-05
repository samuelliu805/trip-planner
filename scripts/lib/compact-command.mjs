import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { finished } from "node:stream/promises";

let commandSequence = 0;
const failureLogMaxAgeMs = 24 * 60 * 60 * 1_000;
const failureLogLimit = 3;

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function elapsed(startedAt) {
  return `${((Date.now() - startedAt) / 1_000).toFixed(1)}s`;
}

async function readTail(path, lineCount, byteLimit = 128 * 1024) {
  const details = await stat(path);
  const length = Math.min(details.size, byteLimit);
  if (!length) return "";
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, details.size - length);
    return buffer.toString("utf8").split(/\r?\n/).slice(-lineCount).join("\n").trim();
  } finally {
    await handle.close();
  }
}

async function pruneCommandLogs(logDirectory, protectedPath = null) {
  const now = Date.now();
  const entries = await readdir(logDirectory, { withFileTypes: true });
  const paths = entries
    .filter(
      (entry) => entry.isFile() && entry.name.startsWith("command-") && entry.name.endsWith(".log"),
    )
    .map((entry) => resolve(logDirectory, entry.name));
  const logs = await Promise.all(
    paths.map(async (path) => ({ path, modifiedAt: (await stat(path)).mtimeMs })),
  );
  logs.sort(
    (left, right) =>
      Number(right.path === protectedPath) - Number(left.path === protectedPath) ||
      right.modifiedAt - left.modifiedAt,
  );
  const retained = logs.filter(
    (log) => log.path === protectedPath || now - log.modifiedAt <= failureLogMaxAgeMs,
  );
  const keep = new Set(retained.slice(0, failureLogLimit).map((log) => log.path));
  await Promise.all(
    logs.filter((log) => !keep.has(log.path)).map((log) => rm(log.path, { force: true })),
  );
  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() && entry.name.startsWith("command-") && entry.name.endsWith(".tmp"),
      )
      .map((entry) => resolve(logDirectory, entry.name))
      .map(async (path) => {
        if (now - (await stat(path)).mtimeMs > failureLogMaxAgeMs) {
          await rm(path, { force: true });
        }
      }),
  );
}

export async function compactCommand({
  args,
  cwd,
  env,
  executable,
  label,
  logDirectory,
  stderr = process.stderr,
  stdout = process.stdout,
  tailLines = 120,
}) {
  await mkdir(logDirectory, { recursive: true });
  await pruneCommandLogs(logDirectory);
  commandSequence += 1;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logStem = `command-${timestamp}-${process.pid}-${commandSequence}-${slug(label) || "run"}`;
  const temporaryLogPath = resolve(logDirectory, `${logStem}.tmp`);
  const logPath = resolve(logDirectory, `${logStem}.log`);
  const displayPath = relative(cwd, logPath) || logPath;
  const log = createWriteStream(temporaryLogPath, { flags: "wx", mode: 0o600 });
  const startedAt = Date.now();
  stdout.write(`RUN  ${label}\n`);

  const result = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, args, { cwd, env, stdio: ["inherit", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => log.write(chunk));
    child.stderr.on("data", (chunk) => log.write(chunk));
    child.on("error", rejectPromise);
    child.on("close", (code, signal) => resolvePromise({ code, signal }));
  }).finally(async () => {
    log.end();
    await finished(log);
  });

  if (result.code === 0) {
    await rm(temporaryLogPath);
    stdout.write(`PASS ${label} (${elapsed(startedAt)})\n`);
    return { durationMs: Date.now() - startedAt };
  }

  await rename(temporaryLogPath, logPath);
  await pruneCommandLogs(logDirectory, logPath);
  const tail = await readTail(logPath, tailLines);
  stderr.write(
    `FAIL ${label} (${elapsed(startedAt)}; ${
      result.signal ? `signal ${result.signal}` : `exit ${result.code ?? "unknown"}`
    })\n`,
  );
  if (tail) stderr.write(`${tail}\n`);
  stderr.write(`Full log: ${displayPath}\n`);
  const error = new Error(`${label} failed`);
  error.cause = result;
  error.compactCommandReported = true;
  error.exitCode = result.code ?? 1;
  error.logPath = logPath;
  throw error;
}
