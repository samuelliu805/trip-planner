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

function browserProxyArguments() {
  const candidate = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!candidate) return [];
  try {
    const proxy = new URL(candidate);
    if (!["http:", "https:"].includes(proxy.protocol) || proxy.username || proxy.password)
      return [];
    return [`--proxy-server=${proxy.origin}`, "--proxy-bypass-list=localhost;127.0.0.1;[::1]"];
  } catch {
    return [];
  }
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
      ...browserProxyArguments(),
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

async function clickElement(browser, elementExpression, label) {
  const point = await evaluate(
    browser,
    `(async () => {
      const element = (${elementExpression});
      if (!element || !element.getClientRects().length || element.disabled) return null;
      element.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return hit && (hit === element || element.contains(hit)) ? { x, y } : null;
    })()`,
  );
  assert.ok(point, `${label} was not available.`);
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

async function verifyVariantAffordance(browser) {
  const hasVisibleChevron = `Boolean([...document.querySelectorAll('button[aria-label^="Open Plans for"]')]
    .find((button) => button.getClientRects().length)?.querySelector('.lucide-chevron-down'))`;
  for (const width of [1280, 820]) {
    await browser.cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { deviceScaleFactor: 1, height: 900, mobile: width < 900, width },
      browser.sessionId,
    );
    await waitFor(browser, hasVisibleChevron, `Plan dropdown chevron at ${width}px`);
  }
  await browser.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { deviceScaleFactor: 1, height: 900, mobile: false, width: 1280 },
    browser.sessionId,
  );
}

async function verifyHardNewTabShare(browser, publicToken) {
  await evaluate(
    browser,
    `window.dispatchEvent(new Event("trip-planner:open-share-settings")); true`,
  );
  await waitFor(
    browser,
    `Boolean([...document.querySelectorAll('[role="dialog"] a')]
      .find((link) => link.getClientRects().length && link.textContent.trim() === "Open page"))`,
    "published Share Page open action",
  );
  const contract = await evaluate(
    browser,
    `(() => {
      const link = [...document.querySelectorAll('[role="dialog"] a')]
        .find((candidate) => candidate.getClientRects().length && candidate.textContent.trim() === "Open page");
      const record = { calls: [], nativeOpen: window.open, replacement: "", tab: null };
      const tab = {
        location: { replace: (url) => { record.replacement = String(url); } },
        opener: window,
      };
      record.tab = tab;
      window.__phase5WindowOpen = record;
      window.open = (url, target) => {
        record.calls.push({ target: String(target), url: String(url) });
        return tab;
      };
      return link ? { href: link.href, rel: link.rel, target: link.target } : null;
    })()`,
  );
  assert.ok(contract, "Published Share Page anchor contract was unavailable.");
  assert.equal(
    await evaluate(
      browser,
      `(() => {
        const link = [...document.querySelectorAll('[role="dialog"] a')]
          .find((candidate) => candidate.getClientRects().length && candidate.textContent.trim() === "Open page");
        if (!(link instanceof HTMLAnchorElement)) return false;
        link.click();
        return true;
      })()`,
    ),
    true,
    "published Share Page open action was not clickable",
  );
  const expectedPath = `/share/${publicToken}`;
  const observed = await evaluate(
    browser,
    `(() => {
      const record = window.__phase5WindowOpen;
      window.open = record.nativeOpen;
      delete window.__phase5WindowOpen;
      return {
        calls: record.calls,
        currentHref: location.href,
        openerCleared: record.tab.opener === null,
        replacement: record.replacement,
      };
    })()`,
  );
  assert.deepEqual(observed.calls, [{ target: "_blank", url: "about:blank" }]);
  assert.equal(observed.openerCleared, true);
  assert.equal(new URL(observed.replacement).pathname, expectedPath);
  assert.equal(new URL(contract.href).pathname, expectedPath);
  assert.equal(contract.target, "_blank");
  assert.match(contract.rel, /\bnoopener\b/u);
  assert.equal(new URL(observed.currentHref).pathname.startsWith("/trips/"), true);
  await browser.cdp.send(
    "Input.dispatchKeyEvent",
    { code: "Escape", key: "Escape", type: "keyDown" },
    browser.sessionId,
  );
  await browser.cdp.send(
    "Input.dispatchKeyEvent",
    { code: "Escape", key: "Escape", type: "keyUp" },
    browser.sessionId,
  );
  await waitFor(
    browser,
    `!document.querySelector('.public-share-settings-dialog')`,
    "published Share Page dialog close",
  );
}

async function verifyVariantNavigation(browser) {
  const trigger = `[...document.querySelectorAll('button[aria-label^="Open Plans for"]')]
    .find((button) => button.getClientRects().length && !button.disabled)`;
  const label = await evaluate(browser, `(${trigger})?.getAttribute('aria-label')`);
  const originalPlan = label?.match(/Current Plan: (.+)$/)?.[1];
  assert.ok(originalPlan, "Global active Plan label was unavailable.");
  await clickElement(browser, trigger, "Global Plans menu");
  await clickElement(
    browser,
    `[...document.querySelectorAll('[role="menuitem"]')]
      .find((item) => item.getClientRects().length && item.textContent.trim() === "New empty Plan")`,
    "Global New empty Plan",
  );
  await waitFor(
    browser,
    `Boolean(document.querySelector('[role="dialog"] input'))`,
    "Global Plan editor",
  );
  const planName = `Global browser Plan ${Date.now()}`;
  await setInputValue(browser, '[role="dialog"] input', planName);
  await waitFor(
    browser,
    `[...document.querySelectorAll('[role="dialog"] button')]
      .some((button) => button.textContent.trim() === "Create Plan" && !button.disabled)`,
    "enabled Global Create Plan",
  );
  const submitted = await evaluate(
    browser,
    `(() => {
      const button = [...document.querySelectorAll('[role="dialog"] button')]
        .find((candidate) => candidate.textContent.trim() === "Create Plan" && !candidate.disabled);
      const form = button?.closest('form');
      if (!(button instanceof HTMLButtonElement) || !(form instanceof HTMLFormElement)) return false;
      form.requestSubmit(button);
      return true;
    })()`,
  );
  assert.equal(submitted, true, "Global Create Plan form was not submit-ready.");
  const createdVariantId = await waitFor(
    browser,
    `(() => {
      const variant = new URLSearchParams(location.search).get('variant');
      const planButton = [...document.querySelectorAll('button[aria-label^="Open Plans for"]')]
        .find((button) => button.getClientRects().length && button.getAttribute('aria-label')?.includes(${JSON.stringify(`Current Plan: ${planName}`)}));
      return variant && planButton && document.querySelector('[data-i18n-aria-label="Editable trip planning matrix"]') ? variant : '';
    })()`,
    "Global created Plan navigation",
    60_000,
  );
  assert.doesNotMatch(await evaluate(browser, "document.body.innerText"), /could not be loaded/i);

  await clickElement(browser, trigger, "Global Plans menu after create");
  await clickElement(
    browser,
    `[...document.querySelectorAll('[role="menuitem"]')]
      .find((item) => item.getClientRects().length && item.textContent.includes(${JSON.stringify(originalPlan)}))`,
    "Global original Plan",
  );
  try {
    await waitFor(
      browser,
      `(() => {
        const variant = new URLSearchParams(location.search).get('variant');
        const planButton = [...document.querySelectorAll('button[aria-label^="Open Plans for"]')]
          .find((button) => button.getClientRects().length && button.getAttribute('aria-label')?.includes(${JSON.stringify(`Current Plan: ${originalPlan}`)}));
        return variant && variant !== ${JSON.stringify(createdVariantId)} && planButton && document.querySelector('[data-i18n-aria-label="Editable trip planning matrix"]') ? variant : '';
      })()`,
      "Global original Plan navigation",
      60_000,
    );
  } catch (error) {
    const diagnostic = await evaluate(
      browser,
      `({
        body: document.body.innerText.slice(0, 1_200),
        href: location.href,
        menuitems: [...document.querySelectorAll('[role="menuitem"]')].map((node) => ({ text: node.textContent.trim(), visible: Boolean(node.getClientRects().length) })),
        trigger: (${trigger})?.getAttribute('aria-label'),
      })`,
    );
    throw new Error(
      `${error instanceof Error ? error.message : error}; original Plan diagnostic: ${JSON.stringify(diagnostic)}`,
    );
  }
  await clickElement(browser, trigger, "Global Plans menu after original switch");
  await clickElement(
    browser,
    `[...document.querySelectorAll('[role="menuitem"]')]
      .find((item) => item.getClientRects().length && item.textContent.includes(${JSON.stringify(planName)}))`,
    "Global created Plan",
  );
  await waitFor(
    browser,
    `new URLSearchParams(location.search).get('variant') === ${JSON.stringify(createdVariantId)}
      && [...document.querySelectorAll('button[aria-label^="Open Plans for"]')]
        .some((button) => button.getClientRects().length && button.getAttribute('aria-label')?.includes(${JSON.stringify(`Current Plan: ${planName}`)}))
      && Boolean(document.querySelector('[data-i18n-aria-label="Editable trip planning matrix"]'))`,
    "Global created Plan revisit",
    60_000,
  );
  assert.doesNotMatch(await evaluate(browser, "document.body.innerText"), /could not be loaded/i);
  assert.equal(
    await evaluate(browser, 'Boolean(document.querySelector("[data-nextjs-dialog]"))'),
    false,
  );
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

async function verifyGlobalBookingSites(browser, baseUrl, tripId) {
  await navigate(browser, baseUrl, `/trips/${tripId}/compare/flights`);
  await waitFor(
    browser,
    `Boolean([...document.querySelectorAll('button[aria-label="Search booking sites"]')]
      .find((button) => button.getClientRects().length && !button.disabled))`,
    "Global booking sites control",
  );
  await clickElement(
    browser,
    `[...document.querySelectorAll('button[aria-label="Search booking sites"]')]
      .find((button) => button.getClientRects().length && !button.disabled)`,
    "Global booking sites",
  );
  await waitFor(
    browser,
    `Boolean(document.querySelector('[role="dialog"]'))`,
    "Global booking sites",
  );
  const bookingSites = await evaluate(
    browser,
    `[...document.querySelectorAll('[role="dialog"] a')].map((link) => ({
      href: link.getAttribute('href'),
      label: link.getAttribute('aria-label'),
      target: link.getAttribute('target'),
      text: link.textContent.trim(),
    }))`,
  );
  assert.equal(bookingSites.length, 3, "Global flight providers did not render one action each.");
  assert.equal(
    bookingSites.some(({ href, label }) =>
      /apps\.apple\.com|download|get the .* app/i.test(`${href} ${label}`),
    ),
    false,
    "Global booking sites still rendered an app-download action.",
  );
  assert.deepEqual(
    bookingSites.map(({ text }) => text),
    ["Google Flights", "Trip.com", "KAYAK"],
  );
  for (const site of bookingSites) {
    assert.match(site.href, /^https:\/\//, `${site.text} did not expose a normal web link.`);
    assert.equal(site.target, "_blank", `${site.text} could replace the Ideas page.`);
  }
  await browser.cdp.send(
    "Input.dispatchKeyEvent",
    { code: "Escape", key: "Escape", type: "rawKeyDown", windowsVirtualKeyCode: 27 },
    browser.sessionId,
  );
  await browser.cdp.send(
    "Input.dispatchKeyEvent",
    { code: "Escape", key: "Escape", type: "keyUp", windowsVirtualKeyCode: 27 },
    browser.sessionId,
  );
  await waitFor(
    browser,
    `!document.querySelector('[role="dialog"]')`,
    "Global booking sites close",
  );
  await navigate(browser, baseUrl, `/trips/${tripId}`);
}

async function submitGlobalLogin(browser, baseUrl, { email, password }) {
  let lastDiagnostic = { category: "not-attempted" };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await navigate(browser, baseUrl, "/trips");
      if ((await evaluate(browser, "location.pathname")) === "/trips") return;
      await navigate(browser, baseUrl, "/login");
    }
    await waitFor(browser, 'Boolean(document.querySelector("#credential"))', "Global login form");
    const submitted = await evaluate(
      browser,
      `(() => {
        const form = document.querySelector('form:has(#credential)');
        const credential = document.querySelector("#credential");
        const password = document.querySelector("#password");
        if (!(form instanceof HTMLFormElement) ||
            !(credential instanceof HTMLInputElement) ||
            !(password instanceof HTMLInputElement)) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        window.__phase5PostLoginDocument = true;
        setter.call(credential, ${JSON.stringify(email)});
        credential.dispatchEvent(new Event("input", { bubbles: true }));
        credential.dispatchEvent(new Event("change", { bubbles: true }));
        setter.call(password, ${JSON.stringify(password)});
        password.dispatchEvent(new Event("input", { bubbles: true }));
        password.dispatchEvent(new Event("change", { bubbles: true }));
        form.requestSubmit();
        return true;
      })()`,
    );
    assert.equal(submitted, true, "Global login form was not submit-ready.");
    try {
      await waitFor(
        browser,
        'location.pathname === "/trips" && !location.search && window.__phase5PostLoginDocument !== true',
        "Global authenticated hard refresh",
      );
      return;
    } catch (error) {
      lastDiagnostic = {
        ...(await boundedPageDiagnostic(browser)),
        attempt: attempt + 1,
        loginFormVisible: await evaluate(
          browser,
          'Boolean(document.querySelector("#credential")?.getClientRects().length)',
        ),
        visibleAlert: await evaluate(
          browser,
          "Boolean([...document.querySelectorAll('[role=\"alert\"]')].find((node) => node.getClientRects().length))",
        ),
      };
      if (attempt === 1) {
        throw new Error(
          `${error instanceof Error ? error.message : error}; bounded login diagnostic: ${JSON.stringify(lastDiagnostic)}`,
        );
      }
    }
  }
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

async function verifyAuthRoutes(baseUrl) {
  await new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "check:auth-routes", "--", baseUrl], {
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Global auth route check failed (${signal ?? `exit ${code}`}).`));
    });
  });
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
      await verifyAuthRoutes(baseUrl);
    }
    browser = await launchBrowser();
    if (remotePreview) await establishPreviewBypass(browser, baseUrl, bypassSecret);
    await navigate(browser, baseUrl, "/login");
    await submitGlobalLogin(browser, baseUrl, options);
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
    await verifyGlobalBookingSites(browser, baseUrl, options.tripId);
    try {
      await waitFor(
        browser,
        'Boolean(window.google?.maps && document.querySelector(".gm-style"))',
        "real Google map",
      );
    } catch (error) {
      const diagnostic = await boundedPageDiagnostic(browser);
      throw new Error(
        `${error instanceof Error ? error.message : error}; bounded map diagnostic: ${JSON.stringify(diagnostic)}`,
      );
    }
    await verifyVariantAffordance(browser);
    await verifyHardNewTabShare(browser, options.publicToken);
    await verifyVariantNavigation(browser);
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
    const publicMetadata = await evaluate(
      browser,
      `(() => ({
        canonical: document.querySelector('link[rel="canonical"]')?.href ?? '',
        icon: document.querySelector('link[rel~="icon"]')?.href ?? '',
        image: document.querySelector('meta[property="og:image"]')?.content ?? '',
        origin: location.origin,
        path: location.pathname,
      }))()`,
    );
    assert.equal(new URL(publicMetadata.canonical).origin, publicMetadata.origin);
    assert.equal(new URL(publicMetadata.canonical).pathname, publicMetadata.path);
    assert.equal(new URL(publicMetadata.icon).pathname, "/icon.svg");
    assert.equal(new URL(publicMetadata.image).origin, publicMetadata.origin);
    assert.equal(new URL(publicMetadata.image).pathname, `${publicMetadata.path}/opengraph-image`);
    await clickElement(
      browser,
      `document.querySelector('[data-i18n-aria-label="Share itinerary"]')`,
      "public Share itinerary",
    );
    await waitFor(
      browser,
      `(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return dialog?.innerText.includes('Trip image') &&
          dialog.innerText.includes('The owner has not published a trip image yet.');
      })()`,
      "public long-image sharing option",
    );

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
