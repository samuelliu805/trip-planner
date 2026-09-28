import assert from "node:assert/strict";

export async function verifyCrossVariantClipboard({
  browser,
  tripId,
  sourceName,
  sourceVariantId,
  targetName,
  targetVariantId,
  clickElement,
  evaluate,
  waitFor,
}) {
  const trigger = `[...document.querySelectorAll('button[aria-label^="Open Plans for"]')]
    .find((node) => node.getClientRects().length && !node.disabled)`;
  const cell = (row, column) => `document.querySelector('[data-cell="${row}-${column}"]')`;
  const items = (
    row,
    column,
  ) => `[...document.querySelectorAll('[data-cell="${row}-${column}"] [data-edit-item]')]
    .filter((node) => node.getClientRects().length)`;
  const storedClipboard = `JSON.parse(sessionStorage.getItem(${JSON.stringify(`trip-planner/clipboard/${tripId}`)}))`;

  async function metrics(width) {
    await browser.cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: 900, deviceScaleFactor: 1, mobile: false },
      browser.sessionId,
    );
  }
  async function switchPlan(name, id) {
    await clickElement(browser, trigger, "clipboard Plans switcher");
    await clickElement(
      browser,
      `[...document.querySelectorAll('[role="menuitem"], [role="dialog"] button')]
      .find((node) => node.getClientRects().length && node.textContent.includes(${JSON.stringify(name)}))`,
      `clipboard switch to ${name}`,
    );
    await waitFor(
      browser,
      `new URLSearchParams(location.search).get('variant') === ${JSON.stringify(id)} &&
      (${trigger})?.getAttribute('aria-label')?.endsWith(${JSON.stringify(`Current Plan: ${name}`)}) &&
      Boolean(${cell(0, 1)})`,
      "clipboard destination full navigation",
      60_000,
    );
    await waitFor(
      browser,
      `Boolean(${cell(0, 1)}) && Object.keys(${cell(0, 1)})
      .some((key) => key.startsWith('__reactProps$'))`,
      "clipboard destination hydration",
    );
  }
  async function denySystemClipboard() {
    await evaluate(
      browser,
      `Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: {
        readText: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
        writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
      },
    })`,
    );
  }
  async function menuAction(label) {
    await clickElement(
      browser,
      `[...document.querySelectorAll('[role="menuitem"]')]
      .find((node) => node.getClientRects().length && node.textContent.trim() === ${JSON.stringify(label)})`,
      label,
    );
  }
  async function extendSelection(key, code, keyCode) {
    await browser.cdp.send(
      "Input.dispatchKeyEvent",
      {
        type: "rawKeyDown",
        key,
        code,
        modifiers: 8,
        windowsVirtualKeyCode: keyCode,
      },
      browser.sessionId,
    );
    await browser.cdp.send(
      "Input.dispatchKeyEvent",
      {
        type: "keyUp",
        key,
        code,
        modifiers: 8,
        windowsVirtualKeyCode: keyCode,
      },
      browser.sessionId,
    );
  }
  async function pasteCell(row, column) {
    await denySystemClipboard();
    await clickElement(browser, cell(row, column), "clipboard target cell", "right");
    await menuAction("Paste");
  }
  async function settled() {
    await waitFor(
      browser,
      `![...document.querySelectorAll('[role="status"]')]
      .some((node) => node.textContent.includes('Updating selected cells'))`,
      "clipboard mutation settled",
      60_000,
    );
    const alerts = await evaluate(
      browser,
      `[...document.querySelectorAll('[role="alert"]')]
      .filter((node) => node.getClientRects().length).map((node) => node.textContent.trim()).join(' ')`,
    );
    assert.doesNotMatch(alerts, /conflict|could not|no longer|Paste blocked|Every copied/i);
  }
  async function sourceSnapshot() {
    return evaluate(
      browser,
      `({
      activity: (${items(0, 1)}).map((node) => ({ id: node.dataset.editItem, text: node.textContent.trim() })),
      transport: (${items(0, 2)}).map((node) => ({ id: node.dataset.editItem, text: node.textContent.trim() })),
    })`,
    );
  }

  await metrics(1280);
  const original = await sourceSnapshot();
  assert.ok(original.activity.length, "Cross-variant clipboard needs a real source activity.");
  await denySystemClipboard();
  // Native copy events cover the same path as Ctrl/Cmd+C, including a multi-column selection.
  await clickElement(browser, cell(0, 1), "clipboard source activity cell", "right");
  await menuAction("Copy cell");
  await evaluate(browser, `(${cell(0, 1)}).focus()`);
  await extendSelection("ArrowRight", "ArrowRight", 39);
  await waitFor(
    browser,
    `(${cell(0, 1)}).getAttribute('aria-selected') === 'true' &&
    (${cell(0, 2)}).getAttribute('aria-selected') === 'true'`,
    "multi-column clipboard selection",
  );
  await evaluate(
    browser,
    `(() => {
    const data = new DataTransfer();
    (${cell(0, 2)}).dispatchEvent(new ClipboardEvent('copy', { bubbles: true, clipboardData: data }));
  })()`,
  );
  await waitFor(
    browser,
    `${storedClipboard}?.cells?.length === 2`,
    "native multi-cell clipboard persisted",
  );
  assert.deepEqual(await evaluate(browser, `${storedClipboard}.source`), {
    tripId,
    variantId: sourceVariantId,
  });

  await switchPlan(targetName, targetVariantId);
  await pasteCell(0, 1);
  await waitFor(
    browser,
    `(${items(0, 1)}).length === ${original.activity.length} &&
    (${items(0, 2)}).length === ${original.transport.length}`,
    "cross-variant cells copied",
    60_000,
  );
  await settled();
  const copied = await sourceSnapshot();
  for (const category of ["activity", "transport"]) {
    assert.deepEqual(
      copied[category].map(({ text }) => text),
      original[category].map(({ text }) => text),
    );
    assert.ok(
      copied[category].every(({ id }) => !original[category].some((item) => item.id === id)),
    );
  }

  // Appending the same individual item must preserve the already pasted cell contents.
  for (const width of [390, 430]) {
    await metrics(width);
    await switchPlan(sourceName, sourceVariantId);
    assert.deepEqual(await sourceSnapshot(), original, "Pasting changed the source Plan.");
    await denySystemClipboard();
    await clickElement(browser, `(${items(0, 1)})[0]`, "clipboard source item", "right");
    await menuAction("Copy item");
    await waitFor(
      browser,
      `${storedClipboard}?.kind === 'trip-planner/item'`,
      "item clipboard persisted",
    );
    await switchPlan(targetName, targetVariantId);
    const before = await evaluate(browser, `(${items(0, 1)}).length`);
    await clickElement(browser, cell(0, 1), "clipboard item target", "right");
    await browser.cdp.send(
      "Input.dispatchKeyEvent",
      { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
      browser.sessionId,
    );
    await browser.cdp.send(
      "Input.dispatchKeyEvent",
      { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
      browser.sessionId,
    );
    await evaluate(browser, `(${cell(0, 1)}).focus()`);
    const hasSecondDay = width === 430 && (await evaluate(browser, `Boolean(${cell(1, 1)})`));
    const secondDayCount = hasSecondDay ? await evaluate(browser, `(${items(1, 1)}).length`) : 0;
    if (hasSecondDay) await extendSelection("ArrowDown", "ArrowDown", 40);
    await pasteCell(0, 1);
    await waitFor(
      browser,
      `(${items(0, 1)}).length === ${before + 1}`,
      "cross-variant item appended",
      60_000,
    );
    if (hasSecondDay)
      await waitFor(
        browser,
        `(${items(1, 1)}).length === ${secondDayCount + 1}`,
        "item appended to every selected day",
        60_000,
      );
    await settled();
    assert.equal(
      await evaluate(
        browser,
        `document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth`,
      ),
      true,
    );
  }

  // A cell paste still replaces, rather than appending to the individual copies.
  await metrics(1280);
  await switchPlan(sourceName, sourceVariantId);
  await denySystemClipboard();
  await clickElement(browser, cell(0, 1), "source cell replacement copy", "right");
  await menuAction("Copy cell");
  await switchPlan(targetName, targetVariantId);
  await pasteCell(0, 1);
  await waitFor(
    browser,
    `(${items(0, 1)}).length === ${original.activity.length}`,
    "cross-variant cell replaces existing items",
    60_000,
  );
  await settled();
  await evaluate(browser, `delete navigator.clipboard`);
  process.stdout.write(
    "Cross-variant native cells, item append, replacement, source isolation, and 390/430px clipboard passed.\n",
  );
}
