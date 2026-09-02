import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { stopChild } from "./child-process.mjs";

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error("Chrome is required for the Phase 5 Global browser smoke.");
  return executable;
}

class CdpClient {
  constructor(socket) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { reject, resolve }));
    this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return result;
  }
}

async function launchBrowser() {
  const profile = await mkdtemp(join(tmpdir(), "trip-phase5-global-"));
  const child = spawn(
    chromeExecutable(),
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let diagnostics = "";
  let socket;
  try {
    const websocketUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Chrome did not expose CDP. ${diagnostics}`)),
        30_000,
      );
      child.stderr.on("data", (chunk) => {
        diagnostics = `${diagnostics}${chunk}`.slice(-2_000);
        const match = diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (!match) return;
        clearTimeout(timer);
        resolve(match[1]);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Chrome exited before CDP became ready (${code}). ${diagnostics}`));
      });
    });
    socket = new WebSocket(websocketUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Chrome CDP connection timed out.")), 15_000);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("Chrome CDP connection failed."));
        },
        { once: true },
      );
    });
    const cdp = new CdpClient(socket);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { flatten: true, targetId });
    await Promise.all([
      cdp.send("Page.enable", {}, sessionId),
      cdp.send("Runtime.enable", {}, sessionId),
      cdp.send("Network.enable", {}, sessionId),
    ]);
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { deviceScaleFactor: 1, height: 900, mobile: false, width: 1280 },
      sessionId,
    );
    return {
      cdp,
      sessionId,
      async close() {
        try {
          await cdp.send("Browser.close");
        } catch {
          // The process cleanup handles an already-closed browser.
        }
        socket.close();
        await stopChild(child);
        await rm(profile, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
      },
    };
  } catch (error) {
    socket?.close();
    await stopChild(child);
    await rm(profile, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
    throw error;
  }
}

async function evaluate(browser, expression) {
  const result = await browser.cdp.send(
    "Runtime.evaluate",
    { awaitPromise: true, expression, returnByValue: true },
    browser.sessionId,
  );
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? "Browser evaluation failed.");
  return result.result?.value;
}

async function waitFor(browser, expression, label, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(browser, expression);
      if (value) return value;
    } catch {
      // Retry while navigation or hydration is in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function boundedPageDiagnostic(browser) {
  try {
    return await evaluate(
      browser,
      `(() => {
        const body = document.body?.innerText ?? "";
        const error = body.match(/ERROR\\s+(\\d{1,16})/i);
        const heading = document.querySelector("h1,h2,[role=heading]")?.textContent?.trim() ?? "";
        return {
          errorDigest: error?.[1] ?? null,
          heading: heading.slice(0, 120),
          path: location.pathname.slice(0, 240),
          serverError: /server error|couldn.t load/i.test(body),
        };
      })()`,
    );
  } catch {
    return { category: "diagnostic-unavailable" };
  }
}

export function previewProtectionHeaders(secret, setCookie = false) {
  const value = secret?.trim();
  if (!value) throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required for Global Preview.");
  return {
    "x-vercel-protection-bypass": value,
    ...(setCookie ? { "x-vercel-set-bypass-cookie": "true" } : {}),
  };
}

export function parsePreviewCookies(setCookieHeaders) {
  return setCookieHeaders.flatMap((header) => {
    const pair = header.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator <= 0) return [];
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      !value ||
      /[\u0000-\u001f\u007f]/.test(value)
    )
      return [];
    return [{ name, value }];
  });
}

export async function requireAuthorizedCleanup(response) {
  if (response.status === 200) {
    const cleanup = await response.json();
    assert.equal("error" in cleanup, false);
    return cleanup;
  }
  if (response.status === 401) {
    const responseType = response.headers.get("content-type") ?? "";
    const body = (await response.text()).slice(0, 64).trim();
    if (responseType.includes("text/plain") && body === "Unauthorized") {
      throw new Error(
        "Global Preview rejected cleanup authorization. Its CRON_SECRET must exactly match the cloudbase-pg-dev SUPABASE_DEV_CRON_SECRET.",
      );
    }
    throw new Error(
      "Vercel rejected the protected Preview request before it reached the cleanup route. Verify VERCEL_AUTOMATION_BYPASS_SECRET.",
    );
  }
  throw new Error(`Global Preview cleanup route returned bounded status ${response.status}.`);
}

async function establishPreviewBypass(browser, baseUrl, secret) {
  const response = await fetch(new URL("/login", baseUrl), {
    headers: previewProtectionHeaders(secret, true),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
  const cookies = parsePreviewCookies(setCookieHeaders);
  if (!cookies.length) {
    throw new Error(
      "Global Preview did not issue an automation bypass cookie; verify its protected-environment bypass secret.",
    );
  }
  for (const cookie of cookies) {
    const result = await browser.cdp.send(
      "Network.setCookie",
      { ...cookie, url: new URL(baseUrl).origin },
      browser.sessionId,
    );
    if (!result.success) throw new Error("Global Preview bypass cookie could not be installed.");
  }
}

export async function clearBrowserSessionForPublicShare(browser, baseUrl, bypassSecret) {
  await browser.cdp.send("Network.clearBrowserCookies", {}, browser.sessionId);
  if (bypassSecret) await establishPreviewBypass(browser, baseUrl, bypassSecret);
}

async function navigate(browser, baseUrl, path) {
  await evaluate(browser, "window.__phase5NavigationSentinel = true");
  await browser.cdp.send("Page.navigate", { url: new URL(path, baseUrl).href }, browser.sessionId);
  await waitFor(
    browser,
    'window.__phase5NavigationSentinel !== true && document.readyState === "complete"',
    `${path} load`,
  );
}

async function startApplication(baseUrl) {
  const environment = { ...process.env, PORT: new URL(baseUrl).port || "3100" };
  for (const name of ["GOOGLE_PLACES_API_KEY", "GOOGLE_ROUTES_API_KEY"]) delete environment[name];
  const child = spawn("npm", ["run", "start"], {
    detached: true,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  const capture = (chunk) => (diagnostics = `${diagnostics}${chunk}`.slice(-4_000));
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Global Next.js exited early. ${diagnostics}`);
    try {
      if ((await fetch(new URL("/login", baseUrl))).ok) return child;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await stopChild(child, { processGroup: true });
  throw new Error(`Global Next.js did not become ready. ${diagnostics}`);
}

export async function runGlobalBrowserSmoke(options) {
  const baseUrl = process.env.PHASE5_GLOBAL_BASE_URL ?? "http://127.0.0.1:3100";
  const remotePreview = process.env.PHASE5_START_APP === "0";
  const bypassSecret = remotePreview
    ? process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
    : undefined;
  let browser;
  let server;
  try {
    if (remotePreview) {
      const response = await fetch(new URL("/login", baseUrl), {
        headers: previewProtectionHeaders(bypassSecret),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Global Preview returned ${response.status} for /login.`);
    } else {
      server = await startApplication(baseUrl);
    }
    browser = await launchBrowser();
    if (remotePreview) await establishPreviewBypass(browser, baseUrl, bypassSecret);
    await navigate(browser, baseUrl, "/login");
    await waitFor(browser, 'Boolean(document.querySelector("#credential"))', "Global login form");
    await evaluate(
      browser,
      `(() => {
        const set = (selector, value) => {
          const input = document.querySelector(selector);
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };
        set("#credential", ${JSON.stringify(options.email)});
        set("#password", ${JSON.stringify(options.password)});
        document.querySelector('form:has(#credential) button[type="submit"]').click();
      })()`,
    );
    await waitFor(browser, 'location.pathname === "/trips"', "Global authenticated session");
    await navigate(browser, baseUrl, `/trips/${options.tripId}`);
    try {
      await waitFor(
        browser,
        `document.body.innerText.includes(${JSON.stringify(options.privateTitle)})`,
        "authenticated trip",
      );
    } catch (error) {
      const diagnostic = await boundedPageDiagnostic(browser);
      throw new Error(
        `${error instanceof Error ? error.message : error}; bounded page diagnostic: ${JSON.stringify(diagnostic)}`,
      );
    }
    await waitFor(
      browser,
      'Boolean(window.google?.maps && document.querySelector(".gm-style"))',
      "real Google map",
    );
    const place = await evaluate(
      browser,
      `(async () => {
        const places = await google.maps.importLibrary("places");
        const sessionToken = new places.AutocompleteSessionToken();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: "Golden Gate Bridge",
          sessionToken,
        });
        const prediction = suggestions.find((entry) => entry.placePrediction)?.placePrediction;
        if (!prediction) throw new Error("Google Places returned no prediction");
        const place = prediction.toPlace();
        await place.fetchFields({ fields: ["id", "displayName", "location"] });
        return { id: place.id, latitude: place.location?.lat(), longitude: place.location?.lng() };
      })()`,
    );
    assert.ok(place?.id && Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
    const authenticatedResources = await evaluate(
      browser,
      'performance.getEntriesByType("resource").map((entry) => entry.name)',
    );
    assert.ok(
      authenticatedResources.some((url) => /maps\.googleapis\.com|maps\.gstatic\.com/.test(url)),
    );
    assert.equal(
      authenticatedResources.some((url) => /amap\.com|\/_AMapService\//i.test(url)),
      false,
    );

    await clearBrowserSessionForPublicShare(browser, baseUrl, bypassSecret);
    await navigate(browser, baseUrl, `/share/${options.publicToken}`);
    try {
      await waitFor(
        browser,
        `document.body.innerText.includes(${JSON.stringify(options.intendedTitle)})`,
        "anonymous public snapshot",
      );
    } catch (error) {
      const diagnostic = await boundedPageDiagnostic(browser);
      throw new Error(
        `${error instanceof Error ? error.message : error}; bounded page diagnostic: ${JSON.stringify(diagnostic)}`,
      );
    }
    const publicBody = await evaluate(browser, "document.body.innerText");
    assert.doesNotMatch(publicBody, new RegExp(options.privateTitle));
    assert.equal(await evaluate(browser, 'location.pathname.startsWith("/share/")'), true);

    const protectionHeaders = remotePreview ? previewProtectionHeaders(bypassSecret) : {};
    const unauthorizedCleanup = await fetch(new URL("/api/cron/share-image-cleanup", baseUrl), {
      headers: { ...protectionHeaders, authorization: "Bearer wrong" },
    });
    assert.equal(unauthorizedCleanup.status, 401);
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret) throw new Error("CRON_SECRET is required for the cleanup route smoke.");
    const authorizedCleanup = await fetch(new URL("/api/cron/share-image-cleanup", baseUrl), {
      headers: { ...protectionHeaders, authorization: `Bearer ${cronSecret}` },
    });
    await requireAuthorizedCleanup(authorizedCleanup);
  } finally {
    if (browser) await browser.close();
    if (server) await stopChild(server, { processGroup: true });
  }
  process.stdout.write(
    "Global authenticated/public-share, Google map/place, and cleanup route smoke passed.\n",
  );
}
