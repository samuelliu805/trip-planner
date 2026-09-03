import { readFirstJsonObject } from "./cloudbase-cli-json.mjs";

const path = process.argv[2];

try {
  if (!path || process.argv[3]) throw new Error();
  const payload = await readFirstJsonObject(path);
  if (!Array.isArray(payload?.Logs)) throw new Error();

  const logs = payload.Logs.map((entry) => (typeof entry === "string" ? entry : "")).filter(
    Boolean,
  );
  const unsafe = logs.filter((entry) =>
    /(?:^|\W)(?:fatal|panic|uncaught|unhandled|error)(?:\W|$)|cloudbase[^\n]*(?:websocket|\bws\b)|(?:websocket|\bws\b)[^\n]*cloudbase/i.test(
      entry,
    ),
  );
  if (unsafe.length > 0) throw new Error();

  process.stdout.write(
    `CloudBase Run runtime logs contain no error clusters (${logs.length} lines).\n`,
  );
} catch {
  process.stderr.write("CloudBase Run runtime-log verification failed.\n");
  process.exitCode = 1;
}
