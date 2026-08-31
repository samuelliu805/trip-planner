import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { stopChild } from "./lib/child-process.mjs";

const expected = {
  APP_REGION: "global",
  AUTH_PROVIDER: "supabase",
  DATA_PROVIDER: "supabase",
  NEXT_PUBLIC_MAPS_PROVIDER: "google",
  STORAGE_PROVIDER: "supabase",
};
const baseUrl = process.env.PHASE3_GLOBAL_BASE_URL ?? "http://127.0.0.1:3100";

for (const [name, value] of Object.entries(expected)) {
  if (process.env[name] !== value) throw new Error(`${name} must be ${value}.`);
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Controlled Supabase dev credentials are required for real Global cookie isolation.",
  );
}

const child = spawn("npm", ["run", "start"], {
  detached: true,
  env: { ...process.env, PORT: new URL(baseUrl).port || "3100" },
  stdio: ["ignore", "pipe", "pipe"],
});
let diagnostics = "";
const capture = (chunk) => {
  diagnostics = `${diagnostics}${chunk}`.slice(-8_000);
};
child.stdout.on("data", capture);
child.stderr.on("data", capture);

try {
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Global Next.js exited before becoming ready. ${diagnostics}`);
    }
    try {
      const response = await fetch(new URL("/login", baseUrl));
      ready = response.ok;
      if (ready) break;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Global Next.js did not become ready. ${diagnostics}`);

  const response = await fetch(new URL("/trips", baseUrl), {
    headers: {
      cookie: "tp-cn-access-token=must-not-authenticate-global; tp-cn-refresh-token=ignored",
    },
    redirect: "manual",
  });
  assert(
    [303, 307, 308].includes(response.status),
    `Unexpected protected-route status ${response.status}.`,
  );
  assert.equal(new URL(response.headers.get("location"), baseUrl).pathname, "/login");
  console.log("Global application rejected tp-cn-* cookies on the real protected route.");
} finally {
  await stopChild(child, { processGroup: true });
}
