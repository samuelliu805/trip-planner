import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { promisify } from "node:util";

import { compactCommand } from "./lib/compact-command.mjs";
import { cleanValidationArtifacts } from "./lib/validation-cleanup.mjs";
import {
  readStaticValidationCache,
  staticValidationFingerprint,
  validationStateDirectory,
  writeStaticValidationCache,
} from "./lib/validation-cache.mjs";

const execFileAsync = promisify(execFile);

class TextSink extends Writable {
  chunks = [];

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  toString() {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

test("compact commands discard successful logs without streaming their payload", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "trip-planner-compact-"));
  const stdout = new TextSink();
  const stderr = new TextSink();
  try {
    const result = await compactCommand({
      args: ["-e", 'process.stdout.write("payload-" + "x".repeat(10_000))'],
      cwd: directory,
      env: process.env,
      executable: process.execPath,
      label: "compact success",
      logDirectory: directory,
      stderr,
      stdout,
    });
    assert.match(stdout.toString(), /RUN  compact success\nPASS compact success/);
    assert.doesNotMatch(stdout.toString(), /payload-/);
    assert.equal(stderr.toString(), "");
    assert.equal(result.logPath, undefined);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("compact commands retain no more than three recent failure logs", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "trip-planner-compact-retention-"));
  try {
    for (let index = 0; index < 5; index += 1) {
      await assert.rejects(
        compactCommand({
          args: ["-e", `process.stderr.write("failure-${index}"); process.exit(1)`],
          cwd: directory,
          env: process.env,
          executable: process.execPath,
          label: `failure ${index}`,
          logDirectory: directory,
          stderr: new TextSink(),
          stdout: new TextSink(),
        }),
      );
    }
    const logs = (await readdir(directory)).filter((name) => name.endsWith(".log"));
    assert.equal(logs.length, 3);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("validation cleanup removes logs and stale temp files but preserves the static cache", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "trip-planner-cleanup-"));
  const logs = resolve(directory, "logs");
  try {
    await writeFile(resolve(directory, "static.json"), "cache\n");
    await writeFile(resolve(directory, "static-123.tmp"), "temporary\n");
    await compactCommand({
      args: ["-e", "process.exit(4)"],
      cwd: directory,
      env: process.env,
      executable: process.execPath,
      label: "retained failure",
      logDirectory: logs,
      stderr: new TextSink(),
      stdout: new TextSink(),
    }).catch(() => {});
    const result = await cleanValidationArtifacts(directory);
    assert.equal(result.removedFiles, 1);
    assert.equal(result.removedTemporaryFiles, 1);
    await access(resolve(directory, "static.json"));
    await assert.rejects(access(logs), { code: "ENOENT" });
    await assert.rejects(access(resolve(directory, "static-123.tmp")), { code: "ENOENT" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("compact command failures show a bounded tail and retain the full log", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "trip-planner-compact-failure-"));
  const stdout = new TextSink();
  const stderr = new TextSink();
  try {
    await assert.rejects(
      compactCommand({
        args: [
          "-e",
          'process.stderr.write("first\\n" + "middle\\n".repeat(20) + "last\\n"); process.exit(7)',
        ],
        cwd: directory,
        env: process.env,
        executable: process.execPath,
        label: "compact failure",
        logDirectory: directory,
        stderr,
        stdout,
        tailLines: 3,
      }),
      (error) => error.exitCode === 7 && error.compactCommandReported,
    );
    assert.doesNotMatch(stderr.toString(), /first/);
    assert.match(stderr.toString(), /last/);
    const logPath = stderr.toString().match(/Full log: (.+)\n/)?.[1];
    assert.ok(logPath);
    assert.match(await readFile(resolve(directory, logPath), "utf8"), /^first\n/);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("static validation fingerprints track the exact worktree and dependency install", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "trip-planner-fingerprint-"));
  try {
    await execFileAsync("git", ["init", "-q"], { cwd: directory });
    await writeFile(resolve(directory, "tracked.txt"), "one\n");
    await execFileAsync("git", ["add", "tracked.txt"], { cwd: directory });
    await execFileAsync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "init"],
      { cwd: directory },
    );
    const initial = await staticValidationFingerprint(directory, { APP_REGION: "global" });
    assert.equal(await staticValidationFingerprint(directory, { APP_REGION: "global" }), initial);
    await writeFile(resolve(directory, "tracked.txt"), "two\n");
    const modified = await staticValidationFingerprint(directory, { APP_REGION: "global" });
    assert.notEqual(modified, initial);
    await writeFile(resolve(directory, "untracked.txt"), "new\n");
    const withUntracked = await staticValidationFingerprint(directory, { APP_REGION: "global" });
    assert.notEqual(withUntracked, modified);
    await execFileAsync("git", ["add", "untracked.txt"], { cwd: directory });
    assert.equal(
      await staticValidationFingerprint(directory, { APP_REGION: "global" }),
      withUntracked,
      "staging an unchanged file must not invalidate its content fingerprint",
    );

    const stateDirectory = await validationStateDirectory(directory);
    await writeStaticValidationCache(stateDirectory, modified);
    assert.equal((await readStaticValidationCache(stateDirectory)).fingerprint, modified);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
