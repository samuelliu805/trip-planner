import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { stopChild } from "./lib/child-process.mjs";

function chromeExecutable() {
  return [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"]
    .filter(Boolean)
    .find((candidate) => existsSync(candidate));
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) =>
    server.listen(0, "127.0.0.1", resolve).once("error", reject),
  );
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  assert.equal(typeof address, "object");
  return address.port;
}

async function startApp() {
  const configured = process.env.LANDING_E2E_BASE_URL;
  if (configured) return { baseUrl: configured, close: async () => undefined };
  const port = await availablePort();
  const child = spawn(
    process.execPath,
    ["--use-env-proxy", "node_modules/next/dist/bin/next", "dev", "--webpack", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let diagnostics = "";
  child.stderr.on("data", (chunk) => (diagnostics = `${diagnostics}${chunk}`.slice(-2_000)));
  const baseUrl = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Landing server exited early. ${diagnostics}`);
    try {
      if ((await fetch(baseUrl)).ok) return { baseUrl, close: () => stopChild(child) };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await stopChild(child);
  throw new Error(`Landing server did not become ready. ${diagnostics}`);
}

class CdpClient {
  constructor(socket) {
    this.nextId = 1;
    this.pending = new Map();
    this.errors = [];
    this.failedRequests = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {
        if (message.method === "Runtime.exceptionThrown")
          this.errors.push(message.params.exceptionDetails.text);
        if (message.method === "Log.entryAdded" && message.params.entry.level === "error")
          this.errors.push(message.params.entry.text);
        if (
          message.method === "Network.loadingFailed" &&
          message.params.errorText !== "net::ERR_ABORTED"
        )
          this.failedRequests.push(message.params.errorText);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    });
    this.socket = socket;
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { reject, resolve }));
    this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return result;
  }
}

async function launchBrowser() {
  const executable = chromeExecutable();
  assert.ok(executable, "Chrome is required for landing E2E.");
  const profile = await mkdtemp(join(tmpdir(), "plandock-landing-"));
  const child = spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader-webgl",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let diagnostics = "";
  const websocketUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome CDP timeout. ${diagnostics}`)), 30_000);
    child.stderr.on("data", (chunk) => {
      diagnostics = `${diagnostics}${chunk}`.slice(-2_000);
      const match = diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const socket = new WebSocket(websocketUrl);
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
    cdp.send("Log.enable", {}, sessionId),
    cdp.send("Network.enable", {}, sessionId),
  ]);
  return {
    cdp,
    sessionId,
    async close() {
      try {
        await cdp.send("Browser.close");
      } catch {}
      socket.close();
      await stopChild(child);
      await rm(profile, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
    },
  };
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

async function waitFor(browser, expression, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(browser, expression)) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function viewport(browser, width, height, mobile = false) {
  await browser.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { deviceScaleFactor: 1, height, mobile, width },
    browser.sessionId,
  );
}

async function navigate(browser, baseUrl, path = "/", expectedWebgl = "ready") {
  await browser.cdp.send("Page.navigate", { url: new URL(path, baseUrl).href }, browser.sessionId);
  const webglCondition = expectedWebgl
    ? ` && document.querySelector('.route-dock-canvas')?.dataset.webglState === ${JSON.stringify(expectedWebgl)}`
    : "";
  await waitFor(
    browser,
    `document.readyState === "complete" && document.querySelector('[data-testid="route-dock-hero"]')?.dataset.dockReady === 'true'${webglCondition}`,
    `${path} load`,
  );
}

async function setProgress(browser, progress) {
  await evaluate(
    browser,
    `(() => { const hero = document.querySelector('[data-testid="route-dock-hero"]'); scrollTo(0, (hero.offsetHeight - innerHeight) * ${progress}); window.dispatchEvent(new Event('scroll')); return true; })()`,
  );
  const expected =
    progress < 0.15
      ? "scattered"
      : progress < 0.55
        ? "routing"
        : progress < 0.8
          ? "docking"
          : "assembled";
  await waitFor(
    browser,
    `document.querySelector('[data-testid="route-dock-hero"]').dataset.dockState === ${JSON.stringify(expected)}`,
    `${Math.round(progress * 100)}% ${expected} state`,
  );
  await new Promise((resolve) => setTimeout(resolve, 80));
}

async function screenshot(browser, directory, name) {
  if (!directory) return;
  const { data } = await browser.cdp.send(
    "Page.captureScreenshot",
    { format: "png", fromSurface: true },
    browser.sessionId,
  );
  await writeFile(join(directory, name), Buffer.from(data, "base64"));
}

const app = await startApp();
const browser = await launchBrowser();
const screenshotDirectory = process.env.LANDING_E2E_SCREENSHOT_DIR;
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
try {
  await viewport(browser, 1440, 900);
  await navigate(browser, app.baseUrl);
  const initial = await evaluate(
    browser,
    `({ fragments: [...document.querySelectorAll('[data-fragment]')].filter((node) => node.getClientRects().length && Number(getComputedStyle(node).opacity) > .9).length, state: document.querySelector('[data-testid="route-dock-hero"]').dataset.dockState, webgl: Boolean(document.querySelector('[data-testid="route-dock-canvas"]')?.getContext('webgl2')) })`,
  );
  assert.deepEqual(initial, { fragments: 4, state: "scattered", webgl: true });
  await screenshot(browser, screenshotDirectory, "01-scattered-desktop.png");

  for (const [progress, expected] of [
    [0.25, "routing"],
    [0.5, "routing"],
    [0.75, "docking"],
  ]) {
    await setProgress(browser, progress);
    assert.equal(
      await evaluate(
        browser,
        `document.querySelector('[data-testid="route-dock-hero"]').dataset.dockState`,
      ),
      expected,
    );
    if (progress === 0.5) await screenshot(browser, screenshotDirectory, "02-routing-desktop.png");
  }
  await setProgress(browser, 0.78);
  const alignment = await evaluate(
    browser,
    `([...document.querySelectorAll('[data-fragment]')].map((fragment) => { const target = document.querySelector('[data-dock-target="' + fragment.dataset.fragment + '"]'); const a = fragment.getBoundingClientRect(); const b = target.getBoundingClientRect(); return { delta: Math.max(Math.abs(a.left-b.left), Math.abs(a.top-b.top), Math.abs(a.width-b.width), Math.abs(a.height-b.height)), opacity: Number(getComputedStyle(fragment).opacity) }; }))`,
  );
  for (const item of alignment) {
    assert.ok(item.delta <= 2, `Dock alignment exceeded 2px: ${JSON.stringify(alignment)}`);
    assert.equal(item.opacity, 1);
  }
  await screenshot(browser, screenshotDirectory, "03-docking-desktop.png");

  for (const progress of [0.9, 1]) {
    await setProgress(browser, progress);
    const assembled = await evaluate(
      browser,
      `(() => { const hero = document.querySelector('[data-testid="route-dock-hero"]'); const product = document.querySelector('[data-testid="assembled-product"]'); const rect = product.getBoundingClientRect(); return { hold: (hero.offsetHeight-innerHeight)*.2 >= innerHeight*.5, nextTop: document.querySelector('#how-it-works').getBoundingClientRect().top, state: hero.dataset.dockState, viewport: innerHeight, visible: rect.bottom > 0 && rect.top < innerHeight && getComputedStyle(product).visibility !== 'hidden' }; })()`,
    );
    assert.equal(assembled.state, "assembled");
    assert.equal(assembled.visible, true);
    assert.equal(assembled.hold, true);
    assert.ok(assembled.nextTop >= assembled.viewport - 1);
    if (progress === 0.9)
      await screenshot(browser, screenshotDirectory, "04-assembled-desktop.png");
  }

  for (const [width, height] of [
    [1024, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await viewport(browser, width, height, width < 700);
    await setProgress(browser, 0.9);
    const responsive = await evaluate(
      browser,
      `({ assembled: document.querySelector('[data-testid="assembled-product"]').getBoundingClientRect().bottom <= innerHeight, overflow: document.documentElement.scrollWidth - innerWidth, state: document.querySelector('[data-testid="route-dock-hero"]').dataset.dockState })`,
    );
    assert.equal(responsive.state, "assembled");
    assert.equal(responsive.assembled, true);
    assert.ok(responsive.overflow <= 1, `${width}px overflowed by ${responsive.overflow}px`);
    if (width === 390) await screenshot(browser, screenshotDirectory, "05-assembled-mobile.png");
  }

  await browser.cdp.send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-reduced-motion", value: "reduce" }] },
    browser.sessionId,
  );
  await viewport(browser, 1440, 900);
  await navigate(browser, app.baseUrl, "/", null);
  await waitFor(
    browser,
    `document.querySelector('[data-testid="route-dock-hero"]').dataset.dockState === 'assembled'`,
    "reduced-motion assembled state",
  );
  assert.equal(
    await evaluate(
      browser,
      `[...document.querySelectorAll('[data-fragment]')].every((node) => Number(getComputedStyle(node).opacity) === 0) && document.querySelector('[data-testid="assembled-product"]').getBoundingClientRect().top < innerHeight`,
    ),
    true,
  );
  await screenshot(browser, screenshotDirectory, "06-reduced-motion.png");

  await browser.cdp.send("Emulation.setEmulatedMedia", { features: [] }, browser.sessionId);
  await navigate(browser, app.baseUrl, "/?webgl=off", "fallback");
  await waitFor(
    browser,
    `document.querySelector('.route-dock-canvas').dataset.webglState === 'fallback'`,
    "WebGL fallback",
  );
  assert.equal(
    await evaluate(
      browser,
      `document.querySelector('[data-testid="route-dock-hero"]').dataset.dockState`,
    ),
    "assembled",
  );
  const routes = await evaluate(
    browser,
    `Promise.all(['/guest','/login','/privacy','/terms','/support'].map(async (path) => [path, (await fetch(path)).status]))`,
  );
  for (const [path, status] of routes) assert.equal(status, 200, `${path} returned ${status}`);
  const landingCopy = await evaluate(
    browser,
    `({ hasHowItWorksLink: document.querySelector('a[href="#how-it-works"]') !== null, hasSampleLink: document.querySelector('a[href="#sample-trip"]') !== null, mentionsOldBrand: document.body.innerText.includes("Plandock"), mentionsSampleTrip: /sample trip/i.test(document.body.innerText), tripPlannerMarks: [...document.querySelectorAll('.plandock-wordmark')].filter((node) => node.textContent.trim() === 'Trip Planner').length })`,
  );
  assert.deepEqual(landingCopy, {
    hasHowItWorksLink: true,
    hasSampleLink: false,
    mentionsOldBrand: false,
    mentionsSampleTrip: false,
    tripPlannerMarks: 2,
  });
  await evaluate(browser, `document.querySelector('button[aria-label^="Switch"]')?.click(); true`);
  await waitFor(
    browser,
    `document.documentElement.lang === 'zh-CN' && document.querySelector('h1')?.textContent.includes('在一处规划')`,
    "Simplified Chinese landing copy",
  );

  assert.deepEqual(browser.cdp.errors, []);
  assert.deepEqual(browser.cdp.failedRequests, []);
  console.log(
    "Landing E2E passed: WebGL, docking, hold, responsive, fallback, routes, and locales.",
  );
} finally {
  await browser.close();
  await app.close();
}
