import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { finished } from "node:stream/promises";

let commandSequence = 0;

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
  commandSequence += 1;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = resolve(
    logDirectory,
    `${timestamp}-${process.pid}-${commandSequence}-${slug(label) || "command"}.log`,
  );
  const displayPath = relative(cwd, logPath) || logPath;
  const log = createWriteStream(logPath, { flags: "wx", mode: 0o600 });
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
    stdout.write(`PASS ${label} (${elapsed(startedAt)})\n`);
    return { durationMs: Date.now() - startedAt, logPath };
  }

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
