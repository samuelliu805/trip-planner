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
    this.requests = [];
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {
        if (message.method === "Network.requestWillBeSent") {
          const request = message.params?.request;
          this.requests.push({
            hasNextAction: Object.keys(request?.headers ?? {}).some(
              (name) => name.toLowerCase() === "next-action",
            ),
            method: request?.method,
            url: request?.url,
          });
        }
        return;
      }
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

async function clickElementWhenAvailable(browser, elementExpression, label, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await clickElement(browser, elementExpression, label);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`Timed out waiting to click ${label}.`);
}

async function clickElementUntil(browser, elementExpression, targetExpression, label) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await evaluate(browser, targetExpression).catch(() => false)) return;
    await clickElement(browser, elementExpression, label).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${label}.`);
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

async function openTripMenu(browser) {
  await clickElementWhenAvailable(
    browser,
    `[...document.querySelectorAll('button[data-i18n-aria-label="Trip menu"]')]
      .find((button) => button.getClientRects().length && !button.disabled)`,
    "Global Trip menu",
  );
  await waitFor(
    browser,
    `Boolean([...document.querySelectorAll('[role="menu"][data-state="open"]')]
      .find((menu) => menu.getClientRects().length))`,
    "Global Trip menu content",
  );
}

async function closePlannerEditor(browser, label) {
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
  await waitFor(browser, `!document.querySelector('[data-editor-kind]')`, `${label} close`);
}

async function verifyPeopleHistoryAndPlannerLogout(browser, baseUrl, options) {
  await openTripMenu(browser);
  const menuText = await evaluate(
    browser,
    `[...document.querySelectorAll('[role="menu"][data-state="open"] [role="menuitem"]')]
      .map((item) => item.textContent.trim())`,
  );
  assert.ok(menuText.includes("Invite"), "Invite is not a separate Trip menu item.");
  assert.ok(menuText.includes("History"), "History is not available from the Trip menu.");
  await clickElement(
    browser,
    `[...document.querySelectorAll('[role="menu"][data-state="open"] [role="menuitem"]')]
      .find((item) => item.getClientRects().length && item.textContent.trim() === 'Invite')`,
    "Global Invite menu item",
  );
  await waitFor(
    browser,
    `document.querySelector('[data-editor-kind="trip-people"]')?.innerText.includes(${JSON.stringify(options.email)})`,
    "Global People account identity",
  );
  const peopleEditor = await evaluate(
    browser,
    `(() => {
      const editor = document.querySelector('[data-editor-kind="trip-people"]');
      return {
        hasIdentifierInput: Boolean(editor?.querySelector('#trip-person-identifier')),
        hasSharedEditorScroller: Boolean(editor?.querySelector('[data-planner-editor-scroll]')),
        text: editor?.innerText ?? '',
      };
    })()`,
  );
  assert.equal(peopleEditor.hasIdentifierInput, true);
  assert.equal(peopleEditor.hasSharedEditorScroller, true);
  assert.equal(peopleEditor.text.includes("Traveler"), false);
  for (const { height, width } of [
    { height: 844, width: 390 },
    { height: 932, width: 430 },
  ]) {
    await browser.cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { deviceScaleFactor: 2, height, mobile: true, width },
      browser.sessionId,
    );
    const mobilePeople = await evaluate(
      browser,
      `(() => {
        const editor = document.querySelector('[data-editor-kind="trip-people"]');
        const overlay = document.querySelector('[data-sheet-overlay]');
        const frozen = document.querySelector('.matrix-grid-header');
        const input = editor?.querySelector('#trip-person-identifier');
        const rect = editor?.getBoundingClientRect();
        return {
          documentFits: document.documentElement.scrollWidth <= innerWidth,
          editorZ: Number.parseInt(getComputedStyle(editor).zIndex, 10),
          fits: Boolean(rect) && rect.left >= 0 && rect.right <= innerWidth &&
            rect.top >= 0 && rect.bottom <= innerHeight,
          frozenZ: frozen ? Number.parseInt(getComputedStyle(frozen).zIndex, 10) : 0,
          inputHeight: input?.getBoundingClientRect().height ?? 0,
          overlayZ: Number.parseInt(getComputedStyle(overlay).zIndex, 10),
        };
      })()`,
    );
    assert.equal(mobilePeople.documentFits, true, `Global People overflowed at ${width}px.`);
    assert.equal(mobilePeople.fits, true, `Global People escaped the ${width}px viewport.`);
    assert.ok(mobilePeople.inputHeight >= 44, `Global Invite input was below 44px at ${width}px.`);
    assert.ok(mobilePeople.overlayZ > mobilePeople.frozenZ);
    assert.ok(mobilePeople.editorZ > mobilePeople.overlayZ);
  }
  await browser.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { deviceScaleFactor: 1, height: 900, mobile: false, width: 1280 },
    browser.sessionId,
  );
  await closePlannerEditor(browser, "Global People editor");

  await openTripMenu(browser);
  await clickElement(
    browser,
    `[...document.querySelectorAll('[role="menu"][data-state="open"] [role="menuitem"]')]
      .find((item) => item.getClientRects().length && item.textContent.trim() === 'Trip settings')`,
    "Global Trip settings",
  );
  await waitFor(browser, `Boolean(document.querySelector('#trip-title'))`, "Global Trip settings");
  assert.equal(
    await evaluate(
      browser,
      `Boolean(document.querySelector('[data-editor-kind="trip-settings"] #trip-person-identifier')) ||
        document.querySelector('[data-editor-kind="trip-settings"]')?.innerText.includes('People with access')`,
    ),
    false,
    "People controls are still embedded in Trip settings.",
  );
  await closePlannerEditor(browser, "Global Trip settings");

  await openTripMenu(browser);
  await clickElement(
    browser,
    `[...document.querySelectorAll('[role="menu"][data-state="open"] [role="menuitem"]')]
      .find((item) => item.getClientRects().length && item.textContent.trim() === 'History')`,
    "Global History menu item",
  );
  try {
    await waitFor(
      browser,
      `location.pathname === ${JSON.stringify(`/trips/${options.tripId}/history`)} &&
        document.querySelectorAll('[data-history-actor]').length > 0`,
      "Global History account identities",
    );
  } catch (error) {
    const diagnostic = await boundedPageDiagnostic(browser);
    throw new Error(
      `${error instanceof Error ? error.message : error}; bounded History diagnostic: ${JSON.stringify(diagnostic)}`,
    );
  }
  const historyActors = await evaluate(
    browser,
    `[...document.querySelectorAll('[data-history-actor]')].map((node) => node.textContent.trim())`,
  );
  assert.ok(historyActors.length > 0);
  const targetHistoryActor = historyActors[0];
  assert.ok(
    historyActors.every((actor) => options.actorEmails.includes(actor)),
    `History used a non-account actor label: ${JSON.stringify(historyActors)}.`,
  );
  const historyBody = await evaluate(browser, "document.body.innerText");
  assert.equal(historyBody.includes("Traveler"), false);
  assert.equal(historyBody.includes("Storage usage"), false);
  assert.equal(historyBody.includes('{"'), false, "History still exposes raw JSON.");
  assert.deepEqual(
    await evaluate(
      browser,
      `(() => {
        const filter = document.querySelector('#history-filter');
        const options = [...(filter?.options ?? [])].map((option) => option.value);
        return {
          filterHeight: filter?.getBoundingClientRect().height ?? 0,
          filterValue: filter?.value,
          hasActorOption: options.some((value) => value.startsWith('email:')),
          hasManualDetailControls: Boolean(
            document.querySelector('#history-detail-field, #history-filter-value')),
          hasStaticCategories: ['all', 'plans', 'itinerary', 'people', 'sharing', 'ideas']
            .every((value) => options.includes(value)),
          pagination: Boolean(document.querySelector('[data-history-pagination]')),
          paginationText: document.querySelector('[data-history-pagination]')?.innerText.trim(),
          showsPerPageCopy: document.body.innerText.includes('per page'),
        };
      })()`,
    ),
    {
      filterHeight: 44,
      filterValue: "all",
      hasActorOption: true,
      hasManualDetailControls: false,
      hasStaticCategories: true,
      pagination: true,
      paginationText: "Older\nPage 1\nNewer",
      showsPerPageCopy: false,
    },
  );
  await evaluate(
    browser,
    `(() => {
      const filter = document.querySelector('#history-filter');
      filter.value = [...filter.options].find((option) =>
        option.value.startsWith('email:') &&
        decodeURIComponent(option.value.slice('email:'.length)) === ${JSON.stringify(targetHistoryActor)}
      ).value;
      filter.form.requestSubmit();
    })()`,
  );
  await waitFor(
    browser,
    `new URLSearchParams(location.search).get('filter')?.startsWith('email:') && (() => {
        const actors = [...document.querySelectorAll('[data-history-actor]')];
        return actors.length > 0 && actors.every((node) =>
          node.textContent.trim() === ${JSON.stringify(targetHistoryActor)});
      })()`,
    "Global History exact email results",
  );

  await navigate(browser, baseUrl, `/trips/${options.tripId}`);
  await waitFor(
    browser,
    `Boolean(document.querySelector('[data-i18n-aria-label="Editable trip planning matrix"]'))`,
    "Global planner before logout",
  );
  await openTripMenu(browser);
  await clickElement(
    browser,
    `[...document.querySelectorAll('[role="menu"][data-state="open"] [role="menuitem"]')]
      .find((item) => item.getClientRects().length && item.textContent.trim() === 'Log out')`,
    "Global planner Log out",
  );
  await waitFor(browser, `location.pathname === '/'`, "Global planner logout home", 45_000);
  assert.equal(
    await evaluate(
      browser,
      `[...document.querySelectorAll('a')].some((link) =>
        link.getClientRects().length && link.textContent.trim() === 'Sign in')`,
    ),
    true,
    "Logged-out home did not return to anonymous navigation.",
  );
  await navigate(browser, baseUrl, "/login");
  await submitGlobalLogin(browser, baseUrl, options);
  await navigate(browser, baseUrl, `/trips/${options.tripId}`);
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

  const desktopUserAgent = await evaluate(browser, "navigator.userAgent");
  await browser.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { deviceScaleFactor: 1, height: 900, mobile: false, width: 820 },
    browser.sessionId,
  );
  await browser.cdp.send(
    "Emulation.setUserAgentOverride",
    {
      platform: "MacIntel",
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    },
    browser.sessionId,
  );
  await evaluate(
    browser,
    `(() => {
      window.__phase5OriginalBookingOpen = window.open;
      window.__phase5BookingPopup = {
        closed: false,
        destination: null,
        opener: {},
        timerDelay: null,
        close() { this.closed = true; },
        location: { replace(url) { window.__phase5BookingPopup.destination = url; } },
        setTimeout(callback, delay) {
          window.__phase5BookingPopupClose = callback;
          this.timerDelay = delay;
          return 1;
        },
      };
      window.__phase5BookingOpenCalls = [];
      window.open = (...args) => {
        window.__phase5BookingOpenCalls.push(args);
        return window.__phase5BookingPopup;
      };
    })()`,
  );
  const tabletClick = await evaluate(
    browser,
    `(() => {
      const link = [...document.querySelectorAll('[role="dialog"] a')]
        .find((candidate) => candidate.textContent.trim() === "Trip.com");
      if (!link || !link.getClientRects().length) return false;
      link.click();
      return true;
    })()`,
  );
  assert.equal(tabletClick, true, "Global tablet Trip.com app link was not available.");
  await waitFor(
    browser,
    "window.__phase5BookingOpenCalls.length === 1",
    "Global tablet managed app popup",
    5_000,
  );
  let appPopupEvidence = await evaluate(
    browser,
    `({
      calls: window.__phase5BookingOpenCalls,
      closed: window.__phase5BookingPopup.closed,
      destination: window.__phase5BookingPopup.destination,
      opener: window.__phase5BookingPopup.opener,
      path: location.pathname,
      timerDelay: window.__phase5BookingPopup.timerDelay,
    })`,
  );
  assert.equal(appPopupEvidence.path, `/trips/${tripId}/compare/flights`);
  assert.deepEqual(appPopupEvidence.calls[0], ["about:blank", "_blank"]);
  assert.equal(appPopupEvidence.opener, null, "Managed app popup retained its opener.");
  assert.equal(appPopupEvidence.timerDelay, 1_500);
  assert.match(appPopupEvidence.destination, /^https:\/\/www\.trip\.com\/flights\//);
  assert.equal(appPopupEvidence.closed, false);
  await evaluate(browser, "window.__phase5BookingPopupClose()");
  appPopupEvidence = await evaluate(
    browser,
    `({ closed: window.__phase5BookingPopup.closed, path: location.pathname })`,
  );
  assert.equal(appPopupEvidence.closed, true, "Uncommitted app popup did not close on return.");
  assert.equal(appPopupEvidence.path, `/trips/${tripId}/compare/flights`);
  await evaluate(
    browser,
    `(() => {
      window.open = window.__phase5OriginalBookingOpen;
      delete window.__phase5OriginalBookingOpen;
      delete window.__phase5BookingOpenCalls;
      delete window.__phase5BookingPopup;
      delete window.__phase5BookingPopupClose;
    })()`,
  );
  await browser.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { deviceScaleFactor: 1, height: 900, mobile: false, width: 1280 },
    browser.sessionId,
  );
  await browser.cdp.send(
    "Emulation.setUserAgentOverride",
    { userAgent: desktopUserAgent },
    browser.sessionId,
  );
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

async function submitGuestLogin(browser, baseUrl, options) {
  return submitGlobalLogin(browser, baseUrl, options, {
    expected: `(() => {
      const match = location.pathname.match(/^\\/trips\\/([0-9a-f-]{36})$/);
      return match && document.querySelector('.public-share-settings-dialog') ? match[1] : '';
    })()`,
    label: "guest import and share continuation",
    loginPath: "/login?guest=1",
    timeoutMs: 90_000,
  });
}

async function verifyGuestTabletLayout(browser) {
  const viewports = [
    { height: 600, width: 768 },
    { height: 600, width: 820 },
    { height: 700, width: 1024 },
  ];
  for (const viewport of viewports) {
    await browser.cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { deviceScaleFactor: 1, mobile: false, ...viewport },
      browser.sessionId,
    );
    await waitFor(
      browser,
      `innerWidth === ${viewport.width} && Boolean(document.querySelector('.trip-app-bar-inner'))`,
      `guest ${viewport.width}px tablet layout`,
    );
    const evidence = await evaluate(
      browser,
      `(() => {
        const inner = document.querySelector('.trip-app-bar-inner');
        const menu = [...document.querySelectorAll('button[data-i18n-aria-label="Trip menu"]')]
          .find((button) => button.getClientRects().length);
        const header = document.querySelector('.planner-matrix .matrix-grid-header');
        const date = header?.querySelector('[role="columnheader"]:first-child');
        const city = header?.querySelector('[role="columnheader"]:nth-child(3)');
        const innerRect = inner?.getBoundingClientRect();
        const menuRect = menu?.getBoundingClientRect();
        const style = inner ? getComputedStyle(inner) : null;
        return {
          cityWidth: city?.getBoundingClientRect().width,
          dateWidth: date?.getBoundingClientRect().width,
          documentWidth: document.documentElement.scrollWidth,
          expectedMenuRight: innerRect && style
            ? innerRect.right - Number.parseFloat(style.paddingRight)
            : null,
          innerWidth,
          menuRight: menuRect?.right,
        };
      })()`,
    );
    assert(
      Math.abs(evidence.menuRight - evidence.expectedMenuRight) <= 1,
      `Guest actions did not reach the ${viewport.width}px tablet app-bar edge: ${JSON.stringify(evidence)}.`,
    );
    assert.equal(
      evidence.dateWidth,
      112,
      `Guest Date column width drifted at ${viewport.width}px.`,
    );
    assert.equal(
      evidence.cityWidth,
      128,
      `Guest City column width drifted at ${viewport.width}px.`,
    );
    assert(
      evidence.documentWidth <= evidence.innerWidth + 1,
      `Guest layout overflowed at ${viewport.width}px: ${JSON.stringify(evidence)}.`,
    );
  }
  await browser.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { deviceScaleFactor: 1, height: 900, mobile: false, width: 1280 },
    browser.sessionId,
  );
}

async function verifyGuestTripFlow(browser, baseUrl, options) {
  const activeKey = "trip-planner:guest-trip:global:active";
  const intentKey = "trip-planner:guest-trip:global:intent";
  const markerKey = "trip-planner:guest-trip:global:imported";
  const title = `Global guest browser ${Date.now()}`;

  await navigate(browser, baseUrl, "/");
  await clickElementWhenAvailable(
    browser,
    `[...document.querySelectorAll('a')].find((link) =>
      link.getClientRects().length && new URL(link.href).pathname === '/guest')`,
    "landing guest planning CTA",
  );
  await waitFor(
    browser,
    `location.pathname === '/guest' &&
      Boolean(document.querySelector('[data-guest-planner]')) &&
      document.querySelector('[data-guest-save-state]')?.dataset.guestSaveState === 'saved'`,
    "saved guest planner",
  );
  const initialDraft = await evaluate(
    browser,
    `JSON.parse(localStorage.getItem(${JSON.stringify(activeKey)}))`,
  );
  assert.equal(initialDraft.region, "global");
  assert.equal(initialDraft.trip.owner_id, "guest");
  await verifyGuestTabletLayout(browser);
  const guestRequestStart = browser.cdp.requests.length;

  await clickElementWhenAvailable(
    browser,
    `document.querySelector('button[aria-label="Save to account"]')`,
    "guest Save to account",
  );
  await waitFor(
    browser,
    `document.querySelector('[role="alertdialog"]')?.innerText.includes('Save this trip to your account')`,
    "guest save account dialog",
  );
  await clickElementWhenAvailable(
    browser,
    `[...document.querySelectorAll('[role="alertdialog"] button')].find((button) =>
      button.textContent.trim() === 'Keep planning')`,
    "keep planning after save gate",
  );
  await waitFor(
    browser,
    `!document.querySelector('[role="alertdialog"]')`,
    "closed guest save account dialog",
  );

  await clickElementWhenAvailable(
    browser,
    `document.querySelector('button[data-i18n-aria-label="Trip menu"]')`,
    "guest Trip menu",
  );
  await clickElementWhenAvailable(
    browser,
    `[...document.querySelectorAll('[role="menuitem"]')].find((item) =>
      item.getClientRects().length && item.textContent.trim() === 'Trip settings')`,
    "guest Trip settings",
  );
  await waitFor(browser, `Boolean(document.querySelector('#guest-trip-title'))`, "guest settings");
  await setInputValue(browser, "#guest-trip-title", title);
  assert.equal(
    await evaluate(
      browser,
      `(() => {
        const form = document.querySelector('#guest-trip-title')?.closest('form');
        if (!(form instanceof HTMLFormElement)) return false;
        form.requestSubmit();
        return true;
      })()`,
    ),
    true,
    "Guest settings form was not submit-ready.",
  );
  await waitFor(
    browser,
    `!document.querySelector('#guest-trip-title') &&
      document.querySelector('[data-guest-save-state]')?.dataset.guestSaveState === 'saved' &&
      JSON.parse(localStorage.getItem(${JSON.stringify(activeKey)})).trip.title === ${JSON.stringify(title)}`,
    "guest settings local save",
  );

  await navigate(browser, baseUrl, "/");
  await navigate(browser, baseUrl, "/guest");
  await waitFor(
    browser,
    `document.querySelector('[data-guest-save-state]')?.dataset.guestSaveState === 'saved' &&
      JSON.parse(localStorage.getItem(${JSON.stringify(activeKey)})).draftId === ${JSON.stringify(initialDraft.draftId)} &&
      JSON.parse(localStorage.getItem(${JSON.stringify(activeKey)})).trip.title === ${JSON.stringify(title)}`,
    "reopened guest draft",
  );

  await navigate(browser, baseUrl, "/");
  const seededItemId = await evaluate(
    browser,
    `(() => {
      const draft = JSON.parse(localStorage.getItem(${JSON.stringify(activeKey)}));
      const id = crypto.randomUUID();
      const duplicateId = crypto.randomUUID();
      const placeId = crypto.randomUUID();
      const duplicatePlaceId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const item = {
        attachments: [], booking_url: null, created_at: timestamp,
        day_id: draft.workspace.days[0].id, details: {}, end_time: null, id,
        links: [], notes: null,
        place: {
          coordinateSystem: 'wgs84', countryCode: 'JP', displayName: 'Osaka',
          formattedAddress: 'Osaka, Japan', id: placeId, latitude: 34.6937,
          localityKind: 'locality', localityName: 'Osaka',
          localitySource: 'google_address_component', longitude: 135.5023,
          provider: 'google', providerPlaceId: 'guest-browser-repeated-osaka',
        },
        place_id: placeId, price_amount: null,
        price_currency: null, schedule_kind: 'none', schedule_text: null, sort_order: 0,
        start_time: null, title: 'Guest attachment activity', trip_id: draft.draftId,
        type: 'activity', updated_at: timestamp, variant_id: draft.workspace.variant.id,
      };
      draft.workspace.days[0].items.push(item, {
        ...item,
        id: duplicateId,
        place: { ...item.place, id: duplicatePlaceId },
        place_id: duplicatePlaceId,
        sort_order: 1,
        title: 'Repeated Osaka activity',
      });
      draft.revision += 1;
      draft.trip.updated_at = timestamp;
      draft.updatedAt = timestamp;
      localStorage.setItem(${JSON.stringify(activeKey)}, JSON.stringify(draft));
      return id;
    })()`,
  );
  await navigate(browser, baseUrl, "/guest");
  await waitFor(
    browser,
    `Boolean(document.querySelector('[data-edit-item="${seededItemId}"]'))`,
    "restored guest item",
  );
  assert.equal(
    await evaluate(
      browser,
      `(() => {
        const item = document.querySelector('[data-edit-item="${seededItemId}"]');
        if (!item) return false;
        item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return true;
      })()`,
    ),
    true,
  );
  await waitFor(
    browser,
    `Boolean(document.querySelector('[data-step-id="files"]'))`,
    "guest item editor",
  );
  await clickElementUntil(
    browser,
    `document.querySelector('[data-step-id="files"]')`,
    `Boolean(document.querySelector('[data-guest-attachment-gate]'))`,
    "guest item Files step",
  );
  await clickElementWhenAvailable(
    browser,
    `document.querySelector('[data-guest-attachment-gate] button')`,
    "guest attachment Save to account",
  );
  await waitFor(
    browser,
    `document.querySelector('[role="alertdialog"]')?.innerText.includes('before adding files')`,
    "guest attachment account dialog",
  );
  await clickElementWhenAvailable(
    browser,
    `[...document.querySelectorAll('[role="alertdialog"] button')].find((button) =>
      button.textContent.trim() === 'Keep planning')`,
    "keep planning after attachment gate",
  );
  await waitFor(
    browser,
    `!document.querySelector('[role="alertdialog"]')`,
    "closed guest attachment account dialog",
  );
  await clickElementWhenAvailable(
    browser,
    `document.querySelector('[data-i18n-aria-label="Close editor"]')`,
    "close guest item editor",
  );
  await waitFor(
    browser,
    `!document.querySelector('[data-step-id="files"]')`,
    "closed guest editor",
  );

  const remoteWrites = browser.cdp.requests.slice(guestRequestStart).filter((entry) => {
    try {
      const url = new URL(entry.url);
      return (
        url.origin === new URL(baseUrl).origin &&
        !["GET", "HEAD", "OPTIONS"].includes(entry.method) &&
        (entry.hasNextAction || url.pathname.startsWith("/api/trips/"))
      );
    } catch {
      return false;
    }
  });
  assert.deepEqual(remoteWrites, [], "Guest editing issued a remote Trip write.");

  async function openShareGate() {
    await clickElementWhenAvailable(
      browser,
      `document.querySelector('button[data-i18n-aria-label="Trip menu"]')`,
      "guest Trip menu",
    );
    await clickElementWhenAvailable(
      browser,
      `[...document.querySelectorAll('[role="menuitem"]')].find((item) =>
        item.getClientRects().length && item.textContent.trim() === 'Share trip')`,
      "guest Share trip",
    );
    await waitFor(
      browser,
      `document.querySelector('[role="alertdialog"]')?.innerText.includes('before sharing')`,
      "guest share account dialog",
    );
  }

  await openShareGate();
  await clickElementWhenAvailable(
    browser,
    `[...document.querySelectorAll('[role="alertdialog"] button')].find((button) =>
      button.textContent.trim() === 'Continue to sign in')`,
    "continue guest sign-in",
  );
  await waitFor(
    browser,
    `location.pathname === '/login' && new URLSearchParams(location.search).get('guest') === '1'`,
    "guest login redirect",
  );
  assert.ok(await evaluate(browser, `localStorage.getItem(${JSON.stringify(activeKey)})`));
  assert.equal(
    await evaluate(
      browser,
      `JSON.parse(localStorage.getItem(${JSON.stringify(intentKey)})).action`,
    ),
    "share",
  );

  await navigate(browser, baseUrl, "/guest");
  await waitFor(
    browser,
    `Boolean(document.querySelector('[data-guest-planner]')) &&
      localStorage.getItem(${JSON.stringify(activeKey)}) &&
      !localStorage.getItem(${JSON.stringify(intentKey)})`,
    "guest draft after canceled login",
  );
  await openShareGate();
  await clickElementWhenAvailable(
    browser,
    `[...document.querySelectorAll('[role="alertdialog"] button')].find((button) =>
      button.textContent.trim() === 'Continue to sign in')`,
    "continue guest sign-in after retry",
  );
  await waitFor(browser, `location.pathname === '/login'`, "retried guest login redirect");
  const guestTripId = await submitGuestLogin(browser, baseUrl, options);
  const imported = await evaluate(
    browser,
    `({
      active: localStorage.getItem(${JSON.stringify(activeKey)}),
      intent: localStorage.getItem(${JSON.stringify(intentKey)}),
      marker: localStorage.getItem(${JSON.stringify(markerKey)}),
    })`,
  );
  assert.equal(imported.active, null);
  assert.equal(imported.intent, null);
  assert.equal(imported.marker, null);
  await waitFor(
    browser,
    `Boolean(document.querySelector('.public-share-settings-dialog'))`,
    "continued guest share action",
  );

  const authenticatedGuestKeys = [
    activeKey,
    intentKey,
    markerKey,
    "trip-planner:guest-trip:cn:active",
    "trip-planner:guest-trip:cn:intent",
    "trip-planner:guest-trip:cn:imported",
  ];
  await evaluate(
    browser,
    `${JSON.stringify(authenticatedGuestKeys)}.forEach((key) => localStorage.setItem(key, 'stale')); true`,
  );
  await navigate(browser, baseUrl, "/guest?claim=1");
  await waitFor(
    browser,
    `location.pathname === '/trips' &&
      ${JSON.stringify(authenticatedGuestKeys)}.every((key) => localStorage.getItem(key) === null)`,
    "authenticated guest redirect and storage cleanup",
  );

  await navigate(browser, baseUrl, "/");
  await waitFor(
    browser,
    `[...document.querySelectorAll('a')].some((link) =>
      link.getClientRects().length && link.textContent.trim() === ${JSON.stringify(options.email)} &&
      new URL(link.href).pathname === '/account')`,
    "authenticated landing account link",
  );
  const landingLinks = await evaluate(
    browser,
    `(() => {
      const visible = [...document.querySelectorAll('a')].filter((link) => link.getClientRects().length);
      return {
        hasSignIn: visible.some((link) => link.textContent.trim() === 'Sign in'),
        startPaths: visible.filter((link) => link.textContent.trim() === 'Start planning')
          .map((link) => new URL(link.href).pathname),
      };
    })()`,
  );
  assert.equal(landingLinks.hasSignIn, false);
  assert.ok(landingLinks.startPaths.length > 0);
  assert.deepEqual([...new Set(landingLinks.startPaths)], ["/trips"]);
  await browser.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { deviceScaleFactor: 2, height: 844, mobile: true, width: 390 },
    browser.sessionId,
  );
  const mobileLanding = await evaluate(
    browser,
    `(() => {
      const account = [...document.querySelectorAll('a')].find((link) =>
        link.textContent.trim() === ${JSON.stringify(options.email)} &&
        new URL(link.href).pathname === '/account');
      return {
        accountVisible: Boolean(account?.getClientRects().length),
        documentFits: document.documentElement.scrollWidth <= innerWidth,
      };
    })()`,
  );
  assert.deepEqual(mobileLanding, { accountVisible: true, documentFits: true });
  await browser.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { deviceScaleFactor: 1, height: 900, mobile: false, width: 1280 },
    browser.sessionId,
  );
  await clickElementWhenAvailable(
    browser,
    `[...document.querySelectorAll('a')].find((link) =>
      link.getClientRects().length && link.textContent.trim() === 'Start planning')`,
    "authenticated Start planning",
  );
  await waitFor(
    browser,
    `location.pathname === '/trips'`,
    "authenticated Start planning destination",
  );
  return guestTripId;
}

async function submitGlobalLogin(
  browser,
  baseUrl,
  { email, password },
  target = {
    expected:
      'location.pathname === "/trips" && !location.search && window.__phase5PostLoginDocument !== true',
    label: "Global authenticated hard refresh",
    loginPath: "/login",
    timeoutMs: 45_000,
  },
) {
  let lastDiagnostic = { category: "not-attempted" };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await navigate(browser, baseUrl, target.loginPath);
      const recovered = await evaluate(browser, target.expected);
      if (recovered) return recovered;
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
      return await waitFor(browser, target.expected, target.label, target.timeoutMs);
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
    const guestTripId = await verifyGuestTripFlow(browser, baseUrl, options);
    await navigate(browser, baseUrl, `/trips/${options.tripId}`);
    try {
      await waitFor(
        browser,
        `document.body.innerText.includes(${JSON.stringify(options.authenticatedTitle ?? options.privateTitle)})`,
        "authenticated trip",
      );
    } catch (error) {
      const diagnostic = await boundedPageDiagnostic(browser);
      throw new Error(
        `${error instanceof Error ? error.message : error}; bounded page diagnostic: ${JSON.stringify(diagnostic)}`,
      );
    }
    await verifyPeopleHistoryAndPlannerLogout(browser, baseUrl, options);
    await waitFor(
      browser,
      `document.body.innerText.includes(${JSON.stringify(options.authenticatedTitle ?? options.privateTitle)})`,
      "reauthenticated Global trip",
    );
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
    await waitFor(
      browser,
      "Boolean(window.google?.maps)",
      "Google Places after variant navigation",
      45_000,
    );
    const place = await evaluate(
      browser,
      `(async () => {
        const maps = window.google?.maps;
        if (!maps) throw new Error("Google Maps is unavailable after variant navigation");
        const places = await maps.importLibrary("places");
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
    return guestTripId;
  } finally {
    if (browser) await browser.close();
    if (server) await stopChild(server, { processGroup: true });
  }
  process.stdout.write(
    "Global authenticated/public-share, Google map/place, and cleanup route smoke passed.\n",
  );
}
