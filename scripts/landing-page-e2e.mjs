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
    progress < 0.14
      ? "scattered"
      : progress < 0.5
        ? "routing"
        : progress < 0.75
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
    `({ fragments: [...document.querySelectorAll('[data-fragment]')].filter((node) => node.getClientRects().length && Number(getComputedStyle(node).opacity) > .9).length, navPosition: getComputedStyle(document.querySelector('.plandock-nav')).position, navTop: Math.round(document.querySelector('.plandock-nav').getBoundingClientRect().top), state: document.querySelector('[data-testid="route-dock-hero"]').dataset.dockState, webgl: Boolean(document.querySelector('[data-testid="route-dock-canvas"]')?.getContext('webgl2')) })`,
  );
  assert.deepEqual(initial, {
    fragments: 4,
    navPosition: "fixed",
    navTop: 0,
    state: "scattered",
    webgl: true,
  });
  const seo = await evaluate(
    browser,
    `(() => { const canonical = document.querySelector('link[rel="canonical"]'); const data = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent); return { canonicalPath: new URL(canonical.href).pathname, description: document.querySelector('meta[name="description"]').content, graphTypes: data['@graph'].map((entry) => entry['@type']), title: document.title }; })()`,
  );
  assert.equal(seo.canonicalPath, "/");
  assert.match(seo.description, /route/i);
  assert.deepEqual(seo.graphTypes, ["WebSite", "WebApplication"]);
  assert.match(seo.title, /^Trip Planner/);
  await screenshot(browser, screenshotDirectory, "01-scattered-desktop.png");

  for (const [progress, expected] of [
    [0.25, "routing"],
    [0.49, "routing"],
    [0.7, "docking"],
  ]) {
    await setProgress(browser, progress);
    assert.equal(
      await evaluate(
        browser,
        `document.querySelector('[data-testid="route-dock-hero"]').dataset.dockState`,
      ),
      expected,
    );
    if (progress === 0.49) await screenshot(browser, screenshotDirectory, "02-routing-desktop.png");
  }
  await setProgress(browser, 0.72);
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
    [820, 1180],
    [768, 1024],
    [430, 932],
    [390, 844],
  ]) {
    await viewport(browser, width, height, width < 700);
    await setProgress(browser, 0.9);
    const responsive = await evaluate(
      browser,
      `(() => { const track = document.querySelector('[data-testid="route-dock-hero"]'); const hero = track.closest('.route-dock-hero'); const tail = hero.querySelector('.route-dock-mobile-tail'); const signIn = document.querySelector('.nav-sign-in'); return { assembled: document.querySelector('[data-testid="assembled-product"]').getBoundingClientRect().bottom <= innerHeight, heroHeight: hero.offsetHeight, navPosition: getComputedStyle(document.querySelector('.plandock-nav')).position, navTop: Math.round(document.querySelector('.plandock-nav').getBoundingClientRect().top), nextTop: document.querySelector('#how-it-works').getBoundingClientRect().top, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, signInHeight: signIn?.getBoundingClientRect().height ?? 0, signInVisible: Boolean(signIn?.getClientRects().length), state: track.dataset.dockState, tailHeight: tail.offsetHeight, trackHeight: track.offsetHeight, viewport: innerHeight }; })()`,
    );
    assert.equal(responsive.state, "assembled");
    assert.equal(responsive.assembled, true);
    assert.equal(responsive.navPosition, "fixed");
    assert.equal(responsive.navTop, 0);
    assert.ok(responsive.overflow <= 1, `${width}px overflowed by ${responsive.overflow}px`);
    if (width < 700) {
      assert.equal(responsive.signInVisible, true, `Sign in was hidden at ${width}px.`);
      assert.ok(responsive.signInHeight >= 44, `Sign in was below 44px at ${width}px.`);
      assert.ok(responsive.tailHeight >= 144, `The ${width}px hero tail was too short.`);
      assert.ok(
        Math.abs(responsive.heroHeight - responsive.trackHeight - responsive.tailHeight) <= 1,
        `The ${width}px hero height did not include its static tail.`,
      );
      assert.ok(Math.abs(responsive.trackHeight / responsive.viewport - 3.9) < 0.02);
      assert.ok(responsive.nextTop >= responsive.viewport + responsive.tailHeight - 1);
    }
    if (width === 390) await screenshot(browser, screenshotDirectory, "05-assembled-mobile.png");
  }

  await evaluate(
    browser,
    `(() => { const track = document.querySelector('[data-testid="route-dock-hero"]'); const tail = document.querySelector('.route-dock-mobile-tail'); scrollTo(0, track.offsetHeight - innerHeight + tail.offsetHeight / 2); window.dispatchEvent(new Event('scroll')); return true; })()`,
  );
  await new Promise((resolve) => setTimeout(resolve, 120));
  const canvasTailCoverage = await evaluate(
    browser,
    `(() => { const canvas = document.querySelector('.route-dock-canvas').getBoundingClientRect(); const canvasTrack = document.querySelector('.route-dock-canvas-track').getBoundingClientRect(); const hero = document.querySelector('.route-dock-hero').getBoundingClientRect(); return { canvasBottom: canvas.bottom, canvasTop: canvas.top, canvasTrackBottom: canvasTrack.bottom, heroBottom: hero.bottom, nextTop: document.querySelector('#how-it-works').getBoundingClientRect().top, viewport: innerHeight }; })()`,
  );
  assert.ok(canvasTailCoverage.canvasTop <= 1);
  assert.ok(canvasTailCoverage.canvasBottom >= canvasTailCoverage.viewport - 1);
  assert.ok(Math.abs(canvasTailCoverage.canvasTrackBottom - canvasTailCoverage.heroBottom) <= 1);
  assert.ok(canvasTailCoverage.nextTop > canvasTailCoverage.viewport);

  await viewport(browser, 390, 844, true);
  await navigate(browser, app.baseUrl);
  await setProgress(browser, 0.25);
  const scrollBeforePageshow = await evaluate(browser, `window.scrollY`);
  await evaluate(
    browser,
    `window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); true`,
  );
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(await evaluate(browser, `window.scrollY`), scrollBeforePageshow);
  assert.equal(
    await evaluate(
      browser,
      `document.querySelector('[data-testid="route-dock-hero"]').dataset.dockState`,
    ),
    "routing",
  );
  await navigate(browser, app.baseUrl);

  await evaluate(
    browser,
    `(() => { const account = document.querySelector('.nav-sign-in'); account.classList.add('nav-account'); account.innerHTML = '<span class="nav-account-label" dir="ltr">liushu805@gmail.com</span>'; return true; })()`,
  );
  const accountTruncation = await evaluate(
    browser,
    `(() => { const account = document.querySelector('.nav-account'); const label = account.querySelector('.nav-account-label'); const accountRect = account.getBoundingClientRect(); const navRect = document.querySelector('.plandock-nav').getBoundingClientRect(); const style = getComputedStyle(label); return { direction: style.direction, left: accountRect.left, navLeft: navRect.left, navRight: navRect.right, overflowed: label.scrollWidth > label.clientWidth, right: accountRect.right, textOverflow: style.textOverflow }; })()`,
  );
  assert.equal(accountTruncation.direction, "ltr");
  assert.equal(accountTruncation.textOverflow, "ellipsis");
  assert.equal(accountTruncation.overflowed, true);
  assert.ok(accountTruncation.left >= accountTruncation.navLeft);
  assert.ok(accountTruncation.right <= accountTruncation.navRight);
  assert.equal(
    await evaluate(browser, `document.querySelector('.plandock-nav .nav-region-switch')`),
    null,
  );
  assert.equal(
    await evaluate(
      browser,
      `document.querySelector('.plandock-footer .footer-region-switch')?.textContent.trim()`,
    ),
    "Go to China site",
  );

  const revealBefore = await evaluate(
    browser,
    `(() => { const section = document.querySelector('.landing-reveal-section[data-reveal-state="pending"]'); const target = section.firstElementChild; scrollBy(0, target.getBoundingClientRect().top - innerHeight * .88); window.dispatchEvent(new Event('scroll')); return true; })()`,
  );
  assert.equal(revealBefore, true);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(
    await evaluate(
      browser,
      `document.querySelector('.landing-reveal-section')?.dataset.revealState`,
    ),
    "pending",
  );
  await evaluate(
    browser,
    `(() => { const section = document.querySelector('.landing-reveal-section'); const target = section.firstElementChild; scrollBy(0, target.getBoundingClientRect().top - innerHeight * .84); window.dispatchEvent(new Event('scroll')); return true; })()`,
  );
  await waitFor(
    browser,
    `document.querySelector('.landing-reveal-section')?.dataset.revealState === 'visible'`,
    "in-viewport landing section reveal",
  );
  const revealTriggered = await evaluate(
    browser,
    `(() => { const section = document.querySelector('.landing-reveal-section'); const target = section.firstElementChild.getBoundingClientRect(); return { targetTop: target.top, viewport: innerHeight }; })()`,
  );
  assert.ok(revealTriggered.targetTop >= 0);
  assert.ok(revealTriggered.targetTop >= revealTriggered.viewport * 0.78);
  assert.ok(revealTriggered.targetTop <= revealTriggered.viewport * 0.86);

  await evaluate(
    browser,
    `document.querySelector('.route-section').scrollIntoView({ block: 'start' }); true`,
  );
  const mobileRouteStops = await evaluate(
    browser,
    `([...document.querySelectorAll('.route-stops li')].map((item, index, items) => { const number = item.querySelector(':scope > span').getBoundingClientRect(); const label = item.querySelector('strong').getBoundingClientRect(); const itemRect = item.getBoundingClientRect(); const line = getComputedStyle(item, '::after'); return { direction: getComputedStyle(item).flexDirection, labelTop: label.top, lineTop: index < items.length - 1 ? itemRect.top + parseFloat(line.top) : null, numberBottom: number.bottom }; }))`,
  );
  for (const stop of mobileRouteStops) {
    assert.equal(stop.direction, "column");
    assert.ok(stop.labelTop > stop.numberBottom);
    if (stop.lineTop !== null) assert.ok(stop.lineTop < stop.labelTop);
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
    `Promise.all(['/guest','/login','/privacy','/terms','/support','/robots.txt','/sitemap.xml'].map(async (path) => [path, (await fetch(path)).status]))`,
  );
  for (const [path, status] of routes) assert.equal(status, 200, `${path} returned ${status}`);
  const discoveryFiles = await evaluate(
    browser,
    `Promise.all(['/robots.txt','/sitemap.xml'].map(async (path) => [path, await (await fetch(path)).text()]))`,
  );
  const discoveryByPath = Object.fromEntries(discoveryFiles);
  assert.match(discoveryByPath["/robots.txt"], /Disallow: \/api\//);
  assert.match(discoveryByPath["/robots.txt"], /Sitemap: .*\/sitemap\.xml/);
  assert.match(discoveryByPath["/sitemap.xml"], /<loc>.*<\/loc>/);
  assert.match(discoveryByPath["/sitemap.xml"], /\/support<\/loc>/);
  const privateRobots = await evaluate(
    browser,
    `Promise.all(['/guest','/login','/signup','/home'].map(async (path) => { const html = await (await fetch(path)).text(); const page = new DOMParser().parseFromString(html, 'text/html'); return [path, page.querySelector('meta[name="robots"]')?.content.includes('noindex') === true]; }))`,
  );
  for (const [path, noindex] of privateRobots) {
    assert.equal(noindex, true, `${path} did not render noindex metadata`);
  }
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
    `document.documentElement.lang === 'zh-CN' && document.querySelector('h1')?.textContent.includes('一站搞定')`,
    "Simplified Chinese landing copy",
  );
  await viewport(browser, 390, 844, true);
  await navigate(browser, app.baseUrl);
  const chineseLanding = await evaluate(
    browser,
    `(() => { const h1 = document.querySelector('h1'); const nav = document.querySelector('.plandock-nav').getBoundingClientRect(); const hero = document.querySelector('.hero-copy').getBoundingClientRect(); const copy = document.body.innerText; return { brandMarks: [...document.querySelectorAll('.plandock-wordmark')].filter((node) => node.textContent.trim() === 'Trip Planner').length, h1Lines: h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight), navClearance: hero.top - nav.bottom, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, untranslatedFixture: ['Day 1','Apr 12','Marriott Rive Gauche','Louvre Museum','Palace of Versailles','Gare du Nord','Rive Gauche'].filter((text) => copy.includes(text)) }; })()`,
  );
  assert.equal(chineseLanding.brandMarks, 2);
  assert.ok(
    chineseLanding.h1Lines <= 2.1,
    `Chinese hero wrapped to ${chineseLanding.h1Lines} lines`,
  );
  assert.ok(chineseLanding.navClearance >= 12);
  assert.ok(chineseLanding.overflow <= 1);
  assert.deepEqual(chineseLanding.untranslatedFixture, []);

  assert.deepEqual(browser.cdp.errors, []);
  assert.deepEqual(browser.cdp.failedRequests, []);
  console.log(
    "Landing E2E passed: WebGL, docking, hold, responsive, fallback, routes, and locales.",
  );
} finally {
  await browser.close();
  await app.close();
}
