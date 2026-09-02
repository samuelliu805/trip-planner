import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  dataOrThrow,
  initializeLiveClient,
  loadLiveConfig,
  signIn,
} from "./lib/cloudbase-pg-live.mjs";
import { stopChild } from "./lib/child-process.mjs";
import { startLoopbackTlsProxy } from "./lib/loopback-tls-proxy.mjs";
import { resolveCnBrowserOrigin } from "./lib/phase-5-cn-browser-origin.mjs";

const requiredSelectors = {
  APP_REGION: "cn",
  AUTH_PROVIDER: "cloudbase",
  DATA_PROVIDER: "cloudbase",
  NEXT_PUBLIC_MAPS_PROVIDER: "amap",
  STORAGE_PROVIDER: "cloudbase",
};
const baseUrl = process.env.PHASE3_APP_BASE_URL ?? "http://127.0.0.1:3100";
const requireAmapSmoke = process.env.PHASE5_REQUIRE_AMAP_SMOKE === "1";
const resolvedBrowserOrigin = resolveCnBrowserOrigin(
  baseUrl,
  process.env.PHASE5_AMAP_ALLOWED_HOSTNAME,
  requireAmapSmoke,
);
let browserBaseUrl = resolvedBrowserOrigin.browserBaseUrl;
const { hostResolverArgument } = resolvedBrowserOrigin;
const runLabel = `phase3-app-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const userA = "trip-planner-cn-test-a";
const userB = "trip-planner-cn-test-b";
let applicationServerDiagnostics = "";

function safeApplicationDiagnostics(value) {
  return String(value)
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer <redacted>")
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|security[_-]?code|secret|password)\s*[:=]\s*)[^\s,}]+/gi,
      "$1<redacted>",
    )
    .replace(/https?:\/\/\S+/g, "<url>")
    .slice(-4_000);
}

function requireProductionSelectors() {
  for (const [name, expected] of Object.entries(requiredSelectors)) {
    if (process.env[name] !== expected) {
      throw new Error(`${name} must be ${expected} for the Phase 3 application E2E.`);
    }
  }
  if (!process.env.CLOUDBASE_TEST_USER_A_PASSWORD || !process.env.CLOUDBASE_TEST_USER_B_PASSWORD) {
    throw new Error("Both controlled CloudBase test account passwords are required.");
  }
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable)
    throw new Error("Chrome or Chromium is required for the Phase 3 application E2E.");
  return executable;
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.diagnostics = [];
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      if (
        ["Log.entryAdded", "Network.loadingFailed", "Runtime.exceptionThrown"].includes(
          message.method,
        )
      ) {
        this.diagnostics.push({ method: message.method, params: message.params });
        this.diagnostics = this.diagnostics.slice(-20);
      }
      if (message.method === "Network.responseReceived") {
        try {
          const response = message.params?.response;
          const url = new URL(response?.url);
          if (url.pathname.startsWith("/_AMapService/")) {
            const errorHeader = Object.entries(response.headers ?? {}).find(
              ([name]) => name.toLowerCase() === "x-trip-planner-amap-error",
            )?.[1];
            this.diagnostics.push({
              method: message.method,
              params: {
                ...(errorHeader && { providerError: String(errorHeader).slice(0, 64) }),
                path: url.pathname,
                status: response.status,
              },
            });
            this.diagnostics = this.diagnostics.slice(-20);
          }
        } catch {
          // Only well-formed AMap service response metadata is diagnostic evidence.
        }
      }
      const listeners = this.listeners.get(message.method) ?? [];
      for (const listener of listeners) listener(message);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { reject, resolve }));
    this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return result;
  }

  waitForEvent(method, predicate = () => true, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const listeners = this.listeners.get(method) ?? [];
      const timer = setTimeout(() => {
        this.listeners.set(
          method,
          (this.listeners.get(method) ?? []).filter((listener) => listener !== receive),
        );
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeoutMs);
      const receive = (message) => {
        if (!predicate(message)) return;
        clearTimeout(timer);
        this.listeners.set(
          method,
          (this.listeners.get(method) ?? []).filter((listener) => listener !== receive),
        );
        resolve(message.params ?? {});
      };
      listeners.push(receive);
      this.listeners.set(method, listeners);
    });
  }
}

async function launchBrowser() {
  const profile = await mkdtemp(join(tmpdir(), "trip-phase3-browser-"));
  const child = spawn(
    chromeExecutable(),
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      ...(browserBaseUrl.startsWith("https:") ? ["--ignore-certificate-errors"] : []),
      ...(hostResolverArgument ? [hostResolverArgument] : []),
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let diagnostics = "";
  let socket;
  try {
    const websocketUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Chrome did not start. ${diagnostics}`)),
        30_000,
      );
      child.stderr.on("data", (chunk) => {
        diagnostics = `${diagnostics}${chunk}`.slice(-4_000);
        const match = diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (!match) return;
        clearTimeout(timer);
        resolve(match[1]);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Chrome exited before CDP became available (${code}). ${diagnostics}`));
      });
    });
    socket = new WebSocket(websocketUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const cdp = new CdpClient(socket);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { flatten: true, targetId });
    await Promise.all([
      cdp.send("Page.enable", {}, sessionId),
      cdp.send("Runtime.enable", {}, sessionId),
      cdp.send("Network.enable", {}, sessionId),
      cdp.send("Log.enable", {}, sessionId),
    ]);
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { deviceScaleFactor: 1, height: 900, mobile: false, width: 1280 },
      sessionId,
    );
    return {
      cdp,
      close: async () => {
        try {
          await cdp.send("Browser.close");
        } catch {
          // The process cleanup below handles a browser that already lost CDP.
        }
        socket.close();
        await stopChild(child);
        await rm(profile, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
      },
      sessionId,
    };
  } catch (error) {
    socket?.close();
    await stopChild(child);
    await rm(profile, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
    throw error;
  }
}

async function startApplicationIfRequested() {
  if (process.env.PHASE3_START_APP !== "1") return null;
  applicationServerDiagnostics = "";
  const applicationEnvironment = {
    ...process.env,
    PORT: new URL(baseUrl).port || "3100",
  };
  delete applicationEnvironment.CLOUDBASE_TEST_USER_A_PASSWORD;
  delete applicationEnvironment.CLOUDBASE_TEST_USER_B_PASSWORD;
  const child = spawn("npm", ["run", "start"], {
    detached: true,
    env: applicationEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (chunk) => {
    applicationServerDiagnostics = `${applicationServerDiagnostics}${chunk}`.slice(-8_000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Next.js exited before becoming ready (${child.exitCode}). ${safeApplicationDiagnostics(applicationServerDiagnostics)}`,
      );
    }
    try {
      const response = await fetch(new URL("/login", baseUrl));
      if (response.ok) return child;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await stopChild(child, { processGroup: true });
  throw new Error(
    `Next.js did not become ready. ${safeApplicationDiagnostics(applicationServerDiagnostics)}`,
  );
}

async function evaluate(browser, expression) {
  const result = await browser.cdp.send(
    "Runtime.evaluate",
    { awaitPromise: true, expression, returnByValue: true },
    browser.sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "Browser evaluation failed.");
  }
  return result.result?.value;
}

async function waitFor(browser, expression, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await evaluate(browser, expression);
      if (last) return last;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${label}; last result: ${String(last)}`);
}

async function assertRealAmapBrowserAdapter(browser) {
  if (!requireAmapSmoke) return;
  await waitFor(
    browser,
    'Boolean(window.AMap && document.querySelector(".amap-container"))',
    "real AMap JS map",
    45_000,
  );
  const resources = await evaluate(
    browser,
    `performance.getEntriesByType("resource").map((entry) => entry.name)`,
  );
  assert.ok(resources.some((url) => /webapi\.amap\.com\/maps|\/_AMapService\//.test(url)));
  assert.equal(
    resources.some((url) => /googleapis|maps\.google|gstatic/i.test(url)),
    false,
  );
}

async function navigate(browser, path) {
  await evaluate(browser, "window.__phase3NavigationSentinel = true");
  await browser.cdp.send(
    "Page.navigate",
    { url: new URL(path, browserBaseUrl).href },
    browser.sessionId,
  );
  await waitFor(
    browser,
    'window.__phase3NavigationSentinel !== true && document.readyState === "complete"',
    `${path} load`,
  );
}

async function clearCookies(browser) {
  await browser.cdp.send("Network.clearBrowserCookies", {}, browser.sessionId);
}

async function setCookie(browser, name, value) {
  const result = await browser.cdp.send(
    "Network.setCookie",
    { name, url: browserBaseUrl, value },
    browser.sessionId,
  );
  assert.equal(result.success, true, `Could not set ${name}.`);
}

async function cookieNames(browser) {
  const result = await browser.cdp.send("Network.getAllCookies", {}, browser.sessionId);
  return result.cookies.map((cookie) => cookie.name);
}

async function cookieMetadata(browser) {
  const result = await browser.cdp.send("Network.getAllCookies", {}, browser.sessionId);
  return result.cookies.map(({ domain, expires, httpOnly, name, path, secure }) => ({
    domain,
    expires,
    httpOnly,
    name,
    path,
    secure,
  }));
}

async function login(browser, username, password) {
  await setCookie(browser, "trip-planner-locale", "en");
  await navigate(browser, "/login");
  try {
    await waitFor(browser, 'Boolean(document.querySelector("#credential"))', "actual login form");
  } catch (error) {
    const diagnostics = await evaluate(
      browser,
      `({
        body: document.body.innerText.slice(0, 1600),
        nextError: Boolean(document.querySelector('[data-nextjs-dialog]')),
        path: location.pathname,
      })`,
    );
    throw new Error(
      `${error instanceof Error ? error.message : error} ${JSON.stringify({
        ...diagnostics,
        cookies: await cookieMetadata(browser),
      })}`,
    );
  }
  await evaluate(
    browser,
    `(() => {
      const set = (selector, value) => {
        const input = document.querySelector(selector);
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set("#credential", ${JSON.stringify(username)});
      set("#password", ${JSON.stringify(password)});
      document.querySelector('form:has(#credential) button[type="submit"]').click();
      return true;
    })()`,
  );
  await waitFor(browser, 'location.pathname === "/trips"', `${username} login`, 45_000);
}

async function clickElement(browser, elementExpression, label) {
  const point = await evaluate(
    browser,
    `(() => {
      const element = (${elementExpression});
      if (!element || !element.getClientRects().length || element.disabled) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
  );
  assert(point, `${label} was not available.`);
  await browser.cdp.send(
    "Input.dispatchMouseEvent",
    { button: "left", clickCount: 1, type: "mousePressed", x: point.x, y: point.y },
    browser.sessionId,
  );
  await browser.cdp.send(
    "Input.dispatchMouseEvent",
    { button: "left", clickCount: 1, type: "mouseReleased", x: point.x, y: point.y },
    browser.sessionId,
  );
}

async function pressElement(browser, elementExpression, label) {
  const focused = await evaluate(
    browser,
    `(() => {
      const element = (${elementExpression});
      if (!element || !element.getClientRects().length || element.disabled) return false;
      element.focus();
      return document.activeElement === element;
    })()`,
  );
  assert.equal(focused, true, `${label} was not available.`);
  await browser.cdp.send(
    "Input.dispatchKeyEvent",
    { code: "Enter", key: "Enter", type: "rawKeyDown", windowsVirtualKeyCode: 13 },
    browser.sessionId,
  );
  await browser.cdp.send(
    "Input.dispatchKeyEvent",
    { code: "Enter", key: "Enter", type: "keyUp", windowsVirtualKeyCode: 13 },
    browser.sessionId,
  );
}

async function clickButtonText(browser, text) {
  await clickElement(
    browser,
    `(() => {
      const expected = ${JSON.stringify(text)};
      return [...document.querySelectorAll('button,[role="menuitem"],a')].find(
        (candidate) => candidate.textContent.trim() === expected && !candidate.disabled && candidate.getClientRects().length,
      );
    })()`,
    `Button ${text}`,
  );
}

async function setInputValue(browser, selector, value) {
  const changed = await evaluate(
    browser,
    `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!(input instanceof HTMLInputElement) || !input.getClientRects().length) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
  );
  assert.equal(changed, true, `${selector} was not available.`);
}

async function readBoundedAmapSuggestionDiagnostic(browser) {
  try {
    return await evaluate(
      browser,
      `(() => {
        const serviceRequests = performance.getEntriesByType("resource")
          .flatMap((entry) => {
            try {
              const url = new URL(entry.name);
              if (!url.pathname.startsWith("/_AMapService/")) return [];
              return [{
                path: url.pathname,
                status: Number.isInteger(entry.responseStatus) ? entry.responseStatus : 0,
              }];
            } catch {
              return [];
            }
          });
        return {
          amapLoaded: Boolean(window.AMap),
          serviceRequestCount: serviceRequests.length,
          serviceRequests: serviceRequests.slice(-5),
        };
      })()`,
    );
  } catch {
    return { category: "diagnostic-unavailable" };
  }
}

async function addAmapActivityThroughUi(browser, query, expectedCount) {
  await clickElement(
    browser,
    `[...document.querySelectorAll('[data-add-item]')].find((button) =>
      button.getClientRects().length && !button.disabled &&
      (button.textContent.includes("Add activity") || button.getAttribute("aria-label")?.startsWith("Add activity on day 1"))
    )`,
    "Add activity",
  );
  const placeSelector = 'input[aria-label="Place or activity name"]';
  await waitFor(
    browser,
    `Boolean(document.querySelector(${JSON.stringify(placeSelector)}))`,
    "activity place search",
  );
  await setInputValue(browser, placeSelector, query);
  try {
    await waitFor(
      browser,
      `Boolean([...document.querySelectorAll('li[role="option"]')].find((option) => option.getClientRects().length))`,
      `AMap suggestions for ${query}`,
      45_000,
    );
  } catch (error) {
    const diagnostic = await readBoundedAmapSuggestionDiagnostic(browser);
    const visibleError = await evaluate(
      browser,
      `document.querySelector('[role="alert"]')?.textContent?.trim().slice(0, 160) ?? ""`,
    );
    throw new Error(
      `${error instanceof Error ? error.message : error}; bounded AMap diagnostic: ${JSON.stringify(
        {
          browser: browser.cdp.diagnostics
            .filter((entry) => entry.method === "Network.responseReceived")
            .slice(-5),
          diagnostic,
          visibleError,
        },
      )}`,
    );
  }
  await clickElement(
    browser,
    `[...document.querySelectorAll('li[role="option"]')].find((option) => option.getClientRects().length)`,
    `AMap suggestion for ${query}`,
  );
  await waitFor(
    browser,
    "Boolean(document.querySelector('button[aria-label=\"Clear map place\"]'))",
    `resolved AMap POI for ${query}`,
    30_000,
  );
  const title = await evaluate(
    browser,
    `document.querySelector('input[id^="item-title-"]')?.value?.trim()`,
  );
  assert.ok(title, `AMap selection for ${query} did not populate the activity name.`);

  const action = await evaluate(
    browser,
    `(() => [...document.querySelectorAll('[role="dialog"] button')]
      .find((button) => ["Confirm order", "Save"].includes(button.textContent.trim()) && !button.disabled)
      ?.textContent.trim())()`,
  );
  assert.ok(action, `The activity editor for ${query} was not saveable.`);
  await clickButtonText(browser, action);
  if (action === "Confirm order") {
    await waitFor(
      browser,
      `[...document.querySelectorAll('[role="dialog"] button')]
        .some((button) => button.textContent.trim() === "Save" && !button.disabled)`,
      "activity order confirmation",
    );
    await clickButtonText(browser, "Save");
  }
  await waitFor(browser, "!document.querySelector('[role=\"dialog\"]')", "activity save", 45_000);
  await waitFor(
    browser,
    `document.querySelectorAll('[data-edit-item]').length >= ${expectedCount}`,
    `saved activity ${expectedCount}`,
    45_000,
  );
  return title;
}

async function calculateAmapRouteThroughUi(browser) {
  await clickElement(browser, `document.querySelector('[data-edit-item]')`, "first saved activity");
  await clickElement(
    browser,
    `document.querySelector('button[aria-label="Show the selected day"]')`,
    "selected day map scope",
  );
  await waitFor(
    browser,
    "Boolean(document.querySelector('button[aria-label=\"Create route\"]'))",
    "create day route control",
  );
  await clickElement(
    browser,
    `document.querySelector('button[aria-label="Create route"]')`,
    "Create route",
  );
  await waitFor(
    browser,
    `[...document.querySelectorAll('button')].some((button) =>
      button.textContent.trim() === "Save & calculate" && !button.disabled
    )`,
    "save and calculate AMap route",
  );
  await clickButtonText(browser, "Save & calculate");
  await waitFor(
    browser,
    `!document.querySelector('[data-i18n-aria-label="Edit Route A"]') &&
      Number(document.querySelector('[data-amap-line-count]')?.dataset.amapLineCount) > 0`,
    "calculated AMap route",
    60_000,
  );
}

async function publishThroughUi(browser) {
  await clickElement(
    browser,
    `document.querySelector('button[aria-label="Share trip"]')`,
    "Share trip",
  );
  await waitFor(
    browser,
    `[...document.querySelectorAll('[role="dialog"] button')].some((button) =>
      button.textContent.trim() === "Create and publish" && !button.disabled
    )`,
    "share publish control",
  );
  await clickButtonText(browser, "Create and publish");
  await waitFor(
    browser,
    "Boolean(document.querySelector('[aria-label=\"Published shareable page\"]'))",
    "published shareable page",
    60_000,
  );
  const publicUrl = await evaluate(
    browser,
    `(() => {
      const panel = document.querySelector('[aria-label="Published shareable page"]');
      return [...panel.querySelectorAll('button')]
        .map((button) => button.textContent.trim())
        .find((text) => /^https?:\\/\\//.test(text));
    })()`,
  );
  assert.ok(publicUrl, "The published page URL was not rendered by the application UI.");
  const token = new URL(publicUrl).pathname.split("/").filter(Boolean).at(-1);
  assert.ok(token, "The application UI returned an invalid public page URL.");
  return token;
}

async function openTripMenu(browser) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await pressElement(
      browser,
      `[...document.querySelectorAll('button[data-i18n-aria-label="Trip menu"]')]
        .find((candidate) => candidate.getClientRects().length && !candidate.disabled)`,
      "Trip menu",
    );
    try {
      await waitFor(
        browser,
        "Boolean(document.querySelector('[role=\"menu\"]'))",
        "Trip menu",
        2_000,
      );
      return;
    } catch {
      // React may still be hydrating after the streamed planner first appears.
    }
  }
  const diagnostics = await evaluate(
    browser,
    `({
      body: document.body.innerText.slice(0, 1200),
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((node) => node.textContent.trim().slice(0, 200)),
      menus: [...document.querySelectorAll('[role="menu"]')].length,
      nextError: Boolean(document.querySelector('[data-nextjs-dialog]')),
      resources: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/_next/')).slice(-20).map((entry) => ({
        duration: Math.round(entry.duration),
        name: entry.name.split('/').slice(-2).join('/'),
        size: entry.transferSize,
      })),
      triggers: [...document.querySelectorAll('button[data-i18n-aria-label="Trip menu"]')].map((button) => ({
        expanded: button.getAttribute('aria-expanded'),
        rects: button.getClientRects().length,
        state: button.getAttribute('data-state'),
      })),
    })`,
  );
  throw new Error(
    `Trip menu did not open after hydration: ${JSON.stringify({
      ...diagnostics,
      cdp: browser.cdp.diagnostics,
    })}`,
  );
}

async function updateTripTitle(browser, nextTitle) {
  await openTripMenu(browser);
  await waitFor(
    browser,
    `[...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent.includes("Trip settings"))`,
    "Trip settings menu item",
  );
  await clickButtonText(browser, "Trip settings");
  await waitFor(browser, 'Boolean(document.querySelector("#trip-title"))', "Trip settings editor");
  await evaluate(
    browser,
    `(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      const set = (selector, value) => {
        const input = document.querySelector(selector);
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set("#trip-title", ${JSON.stringify(nextTitle)});
      set("#trip-day-count", "12");
      return true;
    })()`,
  );
  assert.equal(
    await evaluate(
      browser,
      'new FormData(document.querySelector("#trip-title").form).get("title")',
    ),
    nextTitle,
    "Trip settings form did not contain the updated title.",
  );
  assert.equal(
    await evaluate(
      browser,
      'new FormData(document.querySelector("#trip-title").form).get("day_count")',
    ),
    "12",
    "Trip settings form did not contain the updated duration.",
  );
  await evaluate(browser, 'document.querySelector("#trip-title").form.requestSubmit()');
  try {
    await waitFor(browser, '!document.querySelector("#trip-title")', "Trip settings save", 45_000);
  } catch (error) {
    const diagnostics = await evaluate(
      browser,
      `({
        alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent.trim()),
        form: document.querySelector('#trip-title')
          ? Object.fromEntries([...new FormData(document.querySelector('#trip-title').form).entries()].map(([key, value]) => [key, String(value)]))
          : null,
      })`,
    );
    throw new Error(
      `${error instanceof Error ? error.message : error} ${JSON.stringify(diagnostics)}`,
    );
  }
  const detailPath = await evaluate(browser, "location.pathname");
  await navigate(browser, detailPath);
  try {
    await waitFor(
      browser,
      `document.body.innerText.includes(${JSON.stringify(nextTitle)})`,
      "updated trip title",
      45_000,
    );
  } catch (error) {
    const diagnostics = await evaluate(
      browser,
      "({ body: document.body.innerText.slice(0, 1800), path: location.pathname })",
    );
    throw new Error(
      `${error instanceof Error ? error.message : error} ${JSON.stringify(diagnostics)}`,
    );
  }
}

async function verifyTabletFrozenLayers(browser) {
  await browser.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { deviceScaleFactor: 1, height: 600, mobile: false, width: 820 },
    browser.sessionId,
  );
  await waitFor(
    browser,
    `document.querySelectorAll(
      '[data-i18n-aria-label="Editable trip planning matrix"] [role="row"]:not(.matrix-grid-header)'
    ).length === 12`,
    "updated twelve-day planner",
    45_000,
  );
  await waitFor(
    browser,
    `(() => {
      const matrix = document.querySelector(
        '[data-i18n-aria-label="Editable trip planning matrix"]'
      );
      return matrix
        && matrix.scrollWidth > matrix.clientWidth + 1
        && matrix.scrollHeight > matrix.clientHeight + 1;
    })()`,
    "tablet planner overflow layout",
    45_000,
  );
  const result = await evaluate(
    browser,
    `(async () => {
      const matrix = document.querySelector(
        '[data-i18n-aria-label="Editable trip planning matrix"]'
      );
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      await nextFrame();
      await nextFrame();
      const targetLeft = Math.min(360, matrix.scrollWidth - matrix.clientWidth);
      const targetTop = Math.min(140, matrix.scrollHeight - matrix.clientHeight);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        matrix.scrollLeft = targetLeft;
        matrix.scrollTop = targetTop;
        matrix.dispatchEvent(new Event("scroll", { bubbles: true }));
        await nextFrame();
        if (matrix.scrollLeft > 0 && matrix.scrollTop > 0) break;
      }
      await nextFrame();
      const header = matrix.querySelector(".matrix-grid-header");
      const frozenHeader = header.querySelector('[role="columnheader"]:first-child');
      const matrixRect = matrix.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const bodyRows = [...matrix.querySelectorAll('[role="row"]:not(.matrix-grid-header)')];
      const visibleBodyRow = bodyRows.find((row) => {
        const rect = row.getBoundingClientRect();
        return rect.bottom > headerRect.bottom + 2 && rect.top < matrixRect.bottom - 2;
      });
      const frozenBody = visibleBodyRow.querySelector('[role="rowheader"]:first-child');
      const bodyCells = [...visibleBodyRow.querySelectorAll('[role="gridcell"]')];
      const frozenRect = frozenBody.getBoundingClientRect();
      const bodyBehindFrozen = bodyCells.some((cell) => {
        const rect = cell.getBoundingClientRect();
        return rect.left < frozenRect.right && rect.right > frozenRect.left;
      });
      const rowHeaderAtFrozenPoint = document
        .elementsFromPoint(frozenRect.left + frozenRect.width / 2, frozenRect.top + frozenRect.height / 2)
        .map((element) => element.closest('[role="rowheader"]'))
        .find(Boolean);
      const columnHeaderAtHeaderPoint = document
        .elementsFromPoint(matrixRect.left + 250, headerRect.top + headerRect.height / 2)
        .map((element) => element.closest('[role="columnheader"]'))
        .find(Boolean);
      const bodyBehindHeader = [...matrix.querySelectorAll('[role="gridcell"]')].some((cell) => {
        const rect = cell.getBoundingClientRect();
        return rect.top < headerRect.bottom && rect.bottom > headerRect.top;
      });
      return {
        bodyBehindFrozen,
        bodyBehindHeader,
        frozenBodyIsTop: rowHeaderAtFrozenPoint === frozenBody,
        headerIsTop: Boolean(columnHeaderAtHeaderPoint),
        frozenBodyCover: getComputedStyle(frozenBody, "::before").backgroundColor,
        frozenHeaderCover: getComputedStyle(frozenHeader, "::before").backgroundColor,
        scrollLeft: matrix.scrollLeft,
        scrollTop: matrix.scrollTop,
      };
    })()`,
  );
  assert(result.scrollLeft > 0, "Tablet Matrix did not scroll horizontally.");
  assert(result.scrollTop > 0, "Tablet Matrix did not scroll vertically.");
  assert.equal(result.bodyBehindFrozen, true, "No body cell moved beneath the frozen columns.");
  assert.equal(result.bodyBehindHeader, true, "No body cell moved beneath the frozen header row.");
  assert.equal(result.frozenBodyIsTop, true, "A body cell painted above a frozen column.");
  assert.equal(result.headerIsTop, true, "A body cell painted above the frozen header row.");
  assert.doesNotMatch(result.frozenBodyCover, /transparent|rgba\(0, 0, 0, 0\)/);
  assert.doesNotMatch(result.frozenHeaderCover, /transparent|rgba\(0, 0, 0, 0\)/);
  await browser.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { deviceScaleFactor: 1, height: 900, mobile: false, width: 1280 },
    browser.sessionId,
  );
}

async function captureMutationForms(browser) {
  await openTripMenu(browser);
  await clickButtonText(browser, "Trip settings");
  await waitFor(browser, 'Boolean(document.querySelector("#trip-title"))', "Trip settings editor");
  const updateEntries = await evaluate(
    browser,
    `(() => [...new FormData(document.querySelector("#trip-title").form).entries()].map(
      ([name, value]) => [name, String(value)],
    ))()`,
  );
  await clickButtonText(browser, "Cancel");
  await waitFor(browser, '!document.querySelector("#trip-title")', "Trip settings close");

  await openTripMenu(browser);
  await clickButtonText(browser, "Delete trip");
  await waitFor(
    browser,
    `(() => {
      const input = document.querySelector('input[name="trip_id"]');
      return input && [...input.form.querySelectorAll('button,[role="menuitem"]')].some(
        (button) => button.textContent.trim() === "Delete trip" && !button.disabled,
      );
    })()`,
    "delete confirmation",
  );
  const deleteEntries = await evaluate(
    browser,
    `(() => {
      const candidates = [...document.querySelectorAll('input[name="trip_id"]')];
      const input = candidates.find((candidate) =>
        [...candidate.form.querySelectorAll('button,[role="menuitem"]')].some(
          (button) => button.textContent.trim() === "Delete trip",
        ),
      );
      return [...new FormData(input.form).entries()].map(([name, value]) => [name, String(value)]);
    })()`,
  );
  await clickButtonText(browser, "Cancel");
  return { deleteEntries, updateEntries };
}

async function forgeForm(browser, path, entries, replacements = {}) {
  return evaluate(
    browser,
    `(async () => {
      const entries = ${JSON.stringify(entries)};
      const replacements = ${JSON.stringify(replacements)};
      const body = new FormData();
      for (const [name, value] of entries) body.append(name, name in replacements ? replacements[name] : value);
      const response = await fetch(${JSON.stringify(new URL(path, baseUrl).href)}, {
        body,
        credentials: "include",
        method: "POST",
        redirect: "manual",
      });
      return { status: response.status, text: (await response.text()).slice(0, 500) };
    })()`,
  );
}

async function deleteTripThroughUi(browser) {
  await openTripMenu(browser);
  await clickButtonText(browser, "Delete trip");
  await waitFor(
    browser,
    `[...document.querySelectorAll('button,[role="menuitem"]')].some(
      (button) => button.textContent.trim() === "Delete trip" && !button.disabled,
    )`,
    "enabled delete confirmation",
  );
  await clickButtonText(browser, "Delete trip");
  await waitFor(browser, 'location.pathname === "/trips"', "trip deletion", 45_000);
}

async function cleanupFixture(tripId) {
  if (!tripId) return { deleted: 0, remaining: 0 };
  const config = loadLiveConfig();
  const { auth, db } = initializeLiveClient(config);
  await signIn(auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD);
  const before = dataOrThrow(
    await db.from("trips").select("id").eq("id", tripId),
    "application E2E cleanup lookup",
  );
  let deleted = 0;
  if (Array.isArray(before) && before.length) {
    const result = dataOrThrow(
      await db.from("trips").delete().eq("id", tripId).select("id"),
      "application E2E cleanup delete",
    );
    deleted = Array.isArray(result) ? result.length : 0;
    if (deleted !== 1) throw new Error("Application E2E cleanup did not delete exactly one row.");
  }
  const after = dataOrThrow(
    await db.from("trips").select("id").eq("id", tripId),
    "application E2E cleanup verification",
  );
  await auth.signOut();
  const remaining = Array.isArray(after) ? after.length : 0;
  if (remaining) throw new Error("Application E2E fixture remained after cleanup.");
  return { deleted, remaining };
}

async function loadPersistedAmapEvidence(tripId) {
  const config = loadLiveConfig();
  const { auth, db } = initializeLiveClient(config);
  try {
    await signIn(auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD);
    const items = dataOrThrow(
      await db
        .from("itinerary_items")
        .select("id,place_id,title")
        .eq("trip_id", tripId)
        .eq("type", "activity"),
      "application E2E AMap activities",
    );
    const placeIds = (Array.isArray(items) ? items : [items])
      .map(({ place_id: placeId }) => placeId)
      .filter(Boolean);
    const places = placeIds.length
      ? dataOrThrow(
          await db
            .from("places")
            .select(
              "id,source,provider_place_id,google_place_id,display_name,formatted_address,latitude,longitude,coordinate_system",
            )
            .in("id", placeIds),
          "application E2E persisted AMap places",
        )
      : [];
    const plans = dataOrThrow(
      await db.from("day_route_plans").select("id").eq("trip_id", tripId),
      "application E2E AMap day route",
    );
    const planIds = (Array.isArray(plans) ? plans : [plans]).map(({ id }) => id).filter(Boolean);
    const calculations = planIds.length
      ? dataOrThrow(
          await db
            .from("day_route_calculations")
            .select("plan_id,calculated_legs")
            .in("plan_id", planIds),
          "application E2E calculated AMap route",
        )
      : [];
    return {
      calculations: Array.isArray(calculations) ? calculations : [calculations],
      items: Array.isArray(items) ? items : [items],
      places: Array.isArray(places) ? places : [places],
    };
  } finally {
    await auth.signOut();
  }
}

function assertPersistedAmapPlaces(evidence) {
  assert.equal(evidence.items.length, 2, "The real UI did not persist both AMap activities.");
  assert.equal(evidence.places.length, 2, "The real UI did not persist both AMap place rows.");
  for (const place of evidence.places) {
    assert.equal(place.source, "amap");
    assert.equal(place.coordinate_system, "wgs84");
    assert.equal(place.google_place_id, null);
    assert.ok(place.provider_place_id, "An AMap place lost its provider place ID.");
    assert.ok(place.display_name, "An AMap place lost its display name.");
    assert.ok(place.formatted_address, "An AMap place lost its formatted address.");
    assert.ok(Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90);
    assert.ok(Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180);
  }
}

function assertPersistedAmapRoute(evidence) {
  assert.equal(evidence.calculations.length, 1, "The real UI did not persist one day route.");
  const legs = evidence.calculations[0]?.calculated_legs;
  assert.ok(Array.isArray(legs) && legs.length > 0, "The persisted AMap route has no legs.");
  for (const leg of legs) {
    assert.deepEqual(
      {
        coordinateSystem: leg.geometry?.coordinateSystem,
        provider: leg.geometry?.provider,
        source: leg.geometry?.source,
      },
      { coordinateSystem: "wgs84", provider: "amap", source: "encoded" },
    );
    assert.ok(leg.geometry?.encodedPolyline, "The persisted AMap route has no encoded geometry.");
  }
}

async function run() {
  requireProductionSelectors();
  let server;
  let browserTlsProxy;
  let browser;
  let tripId;
  let assertionError;
  let cleanup;
  try {
    server = await startApplicationIfRequested();
    if (requireAmapSmoke) {
      browserTlsProxy = await startLoopbackTlsProxy({
        browserHostname: new URL(resolvedBrowserOrigin.browserBaseUrl).hostname,
        upstreamBaseUrl: baseUrl,
      });
      browserBaseUrl = browserTlsProxy.browserBaseUrl;
    }
    browser = await launchBrowser();
    await navigate(browser, "/trips");
    assert.equal(await evaluate(browser, "location.pathname"), "/login");

    await clearCookies(browser);
    await browser.cdp.send(
      "Network.setExtraHTTPHeaders",
      {
        headers: {
          "x-trip-planner-cloudbase-user": encodeURIComponent(
            JSON.stringify({ id: "forged-browser-user" }),
          ),
        },
      },
      browser.sessionId,
    );
    await navigate(browser, "/trips");
    assert.equal(await evaluate(browser, "location.pathname"), "/login");
    await browser.cdp.send("Network.setExtraHTTPHeaders", { headers: {} }, browser.sessionId);

    await setCookie(browser, "sb-phase3-auth-token", "must-not-authenticate-cn");
    await navigate(browser, "/trips");
    assert.equal(await evaluate(browser, "location.pathname"), "/login");
    await clearCookies(browser);

    await login(browser, userA, process.env.CLOUDBASE_TEST_USER_A_PASSWORD);
    let names = await cookieNames(browser);
    assert(names.includes("tp-cn-access-token"));
    assert(names.includes("tp-cn-refresh-token"));
    assert(!names.some((name) => name.startsWith("sb-")));

    const cookiesBeforeRestore = await cookieMetadata(browser);
    await navigate(browser, "/trips");
    const restoredPath = await evaluate(browser, "location.pathname");
    if (restoredPath !== "/trips") {
      throw new Error(
        `Session restore redirected to ${restoredPath}: ${JSON.stringify({
          after: await cookieMetadata(browser),
          before: cookiesBeforeRestore,
        })}`,
      );
    }
    assert.equal(
      await evaluate(browser, 'document.querySelector("h1")?.textContent.trim()'),
      "Trips",
    );
    await waitFor(
      browser,
      `[...document.querySelectorAll('button,a')].some(
        (candidate) => candidate.textContent.trim() === "New trip" && candidate.getClientRects().length,
      )`,
      "new trip control",
    );
    await clickButtonText(browser, "New trip");
    let detailPath;
    try {
      detailPath = await waitFor(
        browser,
        "/^\\/trips\\/[0-9a-f-]{36}$/.test(location.pathname) && location.pathname",
        "created trip redirect",
        60_000,
      );
    } catch (error) {
      const diagnostics = await evaluate(
        browser,
        "({ body: document.body.innerText.slice(0, 2000), path: location.pathname })",
      );
      throw new Error(
        `${error instanceof Error ? error.message : error} ${JSON.stringify(diagnostics)}`,
      );
    }
    tripId = detailPath.split("/").at(-1);
    try {
      await waitFor(
        browser,
        "Boolean(document.querySelector('[data-i18n-aria-label=\"Editable trip planning matrix\"]'))",
        "real planner workspace",
        60_000,
      );
    } catch (error) {
      const page = await evaluate(
        browser,
        "({ body: document.body.innerText.slice(0, 2000), nextError: Boolean(document.querySelector('[data-nextjs-dialog]')), path: location.pathname })",
      );
      throw new Error(
        `${error instanceof Error ? error.message : error} ${JSON.stringify({
          browser: browser.cdp.diagnostics.slice(-10),
          page,
        })}`,
      );
    }
    const body = await evaluate(browser, "document.body.innerText");
    assert.doesNotMatch(body, /Missing required environment variable: (?:NEXT_PUBLIC_)?SUPABASE/);
    assert.equal(
      await evaluate(browser, 'Boolean(document.querySelector("[data-nextjs-dialog]"))'),
      false,
    );
    await assertRealAmapBrowserAdapter(browser);

    const updatedTitle = `${runLabel}-owned-by-a`;
    await updateTripTitle(browser, updatedTitle);
    await addAmapActivityThroughUi(browser, "上海外滩", 1);
    await addAmapActivityThroughUi(browser, "上海人民广场", 2);
    await navigate(browser, `/trips/${tripId}`);
    await waitFor(
      browser,
      `Number(document.querySelector('[data-amap-marker-count]')?.dataset.amapMarkerCount) >= 2`,
      "refreshed AMap markers",
      60_000,
    );
    const amapEvidence = await loadPersistedAmapEvidence(tripId);
    assertPersistedAmapPlaces(amapEvidence);
    const renderedMarkers = await evaluate(
      browser,
      `[...document.querySelectorAll('[data-coordinate-system="wgs84"]')].map((marker) => ({
        coordinateSystem: marker.dataset.coordinateSystem,
        latitude: Number(marker.dataset.wgs84Latitude),
        longitude: Number(marker.dataset.wgs84Longitude),
      }))`,
    );
    assert.ok(
      renderedMarkers.length >= 2,
      "The refreshed AMap canvas did not render both markers.",
    );
    for (const place of amapEvidence.places) {
      assert.ok(
        renderedMarkers.some(
          (marker) =>
            marker.coordinateSystem === "wgs84" &&
            Math.abs(marker.latitude - Number(place.latitude)) < 1e-8 &&
            Math.abs(marker.longitude - Number(place.longitude)) < 1e-8,
        ),
        `The refreshed AMap marker did not retain WGS-84 place ${place.id}.`,
      );
    }
    await calculateAmapRouteThroughUi(browser);
    const routeEvidence = await loadPersistedAmapEvidence(tripId);
    assertPersistedAmapRoute(routeEvidence);
    await assertRealAmapBrowserAdapter(browser);
    const publicToken = await publishThroughUi(browser);
    await verifyTabletFrozenLayers(browser);
    const forms = await captureMutationForms(browser);

    await navigate(browser, "/trips");
    await pressElement(
      browser,
      `document.querySelector(${JSON.stringify(`button[aria-label="Actions for ${updatedTitle}"]`)})`,
      "Created trip actions",
    );
    await clickButtonText(browser, "Mark complete");
    await waitFor(browser, "!document.querySelector('[role=\"menu\"]')", "status action close");
    await waitFor(
      browser,
      `Boolean(document.querySelector('[role="alert"]')) || !document.body.innerText.includes(${JSON.stringify(updatedTitle)})`,
      "status action result",
      45_000,
    );
    const statusError = await evaluate(
      browser,
      "document.querySelector('[role=\"alert\"]')?.textContent.trim() ?? null",
    );
    if (statusError) throw new Error(`Status update failed: ${statusError}`);
    await navigate(browser, "/trips?status=done");
    await waitFor(
      browser,
      `document.body.innerText.includes(${JSON.stringify(updatedTitle)}) && document.body.innerText.includes("Completed")`,
      "status update",
    );

    await clearCookies(browser);
    await login(browser, userB, process.env.CLOUDBASE_TEST_USER_B_PASSWORD);
    await navigate(browser, `/trips/${tripId}`);
    assert.match(
      await evaluate(browser, "document.body.innerText"),
      /This page could not be found|404/,
    );

    const forgedTitle = `${runLabel}-forged-by-b`;
    await forgeForm(browser, `/trips/${tripId}`, forms.updateEntries, { title: forgedTitle });
    await forgeForm(browser, `/trips/${tripId}`, forms.deleteEntries);

    await clearCookies(browser);
    await login(browser, userA, process.env.CLOUDBASE_TEST_USER_A_PASSWORD);
    await navigate(browser, `/trips/${tripId}`);
    await waitFor(
      browser,
      `document.body.innerText.includes(${JSON.stringify(updatedTitle)})`,
      "A trip after B mutation attempts",
    );
    assert.doesNotMatch(
      await evaluate(browser, "document.body.innerText"),
      new RegExp(forgedTitle),
    );

    await clearCookies(browser);
    await navigate(browser, `/share/${publicToken}?view=overview`);
    await waitFor(
      browser,
      `document.body.innerText.includes(${JSON.stringify(updatedTitle)})`,
      "CN anonymous public share",
    );
    assert.equal(await evaluate(browser, 'location.pathname.startsWith("/share/")'), true);
    assert.equal(
      (await cookieNames(browser)).some((name) => name.startsWith("tp-cn-")),
      false,
    );
    if (requireAmapSmoke) {
      await waitFor(
        browser,
        'Boolean(window.AMap && document.querySelector(".amap-container")) && Number(document.querySelector("[data-amap-line-count]")?.dataset.amapLineCount) > 0',
        "public AMap route canvas",
      );
      const publicResources = await evaluate(
        browser,
        'performance.getEntriesByType("resource").map((entry) => entry.name)',
      );
      assert.equal(
        publicResources.some((url) => /googleapis|maps\.google|gstatic/i.test(url)),
        false,
      );
    }

    await login(browser, userA, process.env.CLOUDBASE_TEST_USER_A_PASSWORD);
    await navigate(browser, `/trips/${tripId}`);
    await deleteTripThroughUi(browser);
    await navigate(browser, "/trips");
    try {
      await waitFor(
        browser,
        "Boolean(document.querySelector('button[data-i18n-aria-label=\"Log out\"]'))",
        "trip list logout control",
      );
    } catch (error) {
      const diagnostics = await evaluate(
        browser,
        "({ body: document.body.innerText.slice(0, 1600), path: location.pathname, url: location.href })",
      );
      throw new Error(
        `${error instanceof Error ? error.message : error} ${JSON.stringify({
          ...diagnostics,
          cookies: await cookieMetadata(browser),
        })}`,
      );
    }
    await clickElement(
      browser,
      "document.querySelector('button[data-i18n-aria-label=\"Log out\"]')",
      "Log out",
    );
    await waitFor(browser, 'location.pathname === "/login"', "logout");
    names = await cookieNames(browser);
    assert(!names.some((name) => name.startsWith("tp-cn-")));
    await navigate(browser, "/trips");
    assert.equal(await evaluate(browser, "location.pathname"), "/login");
  } catch (error) {
    const diagnostics = safeApplicationDiagnostics(applicationServerDiagnostics);
    const message = safeApplicationDiagnostics(error instanceof Error ? error.message : error);
    assertionError = diagnostics
      ? new Error(`${message}\nNext.js diagnostics:\n${diagnostics}`, { cause: error })
      : new Error(message, { cause: error });
  } finally {
    const recordCleanupFailure = (error) => {
      assertionError = new AggregateError(
        [assertionError, error].filter(Boolean),
        "Phase 3 application E2E or fixture cleanup failed.",
      );
    };
    try {
      cleanup = await cleanupFixture(tripId);
    } catch (error) {
      recordCleanupFailure(error);
    }
    try {
      if (browser) await browser.close();
    } catch (error) {
      recordCleanupFailure(error);
    }
    try {
      if (browserTlsProxy) await browserTlsProxy.close();
    } catch (error) {
      recordCleanupFailure(error);
    }
    try {
      if (server) await stopChild(server, { processGroup: true });
    } catch (error) {
      recordCleanupFailure(error);
    }
  }
  if (cleanup) {
    console.log(
      `Fixture cleanup verified: deleted=${cleanup.deleted}, remaining=${cleanup.remaining}.`,
    );
  }
  if (assertionError) throw assertionError;
  console.log(`Phase 3 application E2E passed for controlled users A and B (${tripId}).`);
  console.log(
    "Tablet Matrix frozen header and column cover passed at 820x600 after two-axis scroll.",
  );
  console.log("CN accepted only tp-cn-* session cookies and logout cleared them.");
  if (requireAmapSmoke) {
    console.log(
      "Real UI AMap search/select/save/refresh/route/publish/public-route smoke passed with WGS-84 persistence and zero Google requests.",
    );
  }
  console.log("A list/create/detail/update/status/delete and B read/update/delete denial passed.");
  console.log("CN anonymous public-share application smoke passed without a session cookie.");
}

run().then(
  () => process.exit(0),
  (error) => {
    const render = (value) =>
      value instanceof AggregateError
        ? `${value.message}\n${value.errors.map((entry) => render(entry)).join("\n")}`
        : value instanceof Error
          ? (value.stack ?? value.message)
          : String(value);
    console.error(render(error));
    process.exit(1);
  },
);
