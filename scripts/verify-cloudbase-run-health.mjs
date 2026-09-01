import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const failureMessage = "CloudBase Run health verification failed.\n";
const maxAttempts = 20;
const requestTimeoutMs = 10_000;
const retryDelayMs = 10_000;

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function healthUrl(siteUrl) {
  const url = new URL("/api/health", siteUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error();
  }
  return url;
}

export async function waitForCloudBaseRunHealth(
  siteUrl,
  {
    fetchImpl = fetch,
    attempts = maxAttempts,
    timeoutMs = requestTimeoutMs,
    delayMs = retryDelayMs,
  } = {},
) {
  const url = healthUrl(siteUrl);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 200) {
        const payload = await response.json();
        if (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          Object.keys(payload).length === 1 &&
          payload.status === "ok"
        ) {
          return true;
        }
      } else {
        await response.body?.cancel();
      }
    } catch {
      // Retry without exposing the URL, response, headers, or environment.
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < attempts) await delay(delayMs);
  }

  return false;
}

async function main() {
  const siteUrl = process.argv[2];
  if (!siteUrl || process.argv[3]) throw new Error();
  if (!(await waitForCloudBaseRunHealth(siteUrl))) throw new Error();
  process.stdout.write("CloudBase Run health check reports status=ok.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write(failureMessage);
    process.exitCode = 1;
  });
}
