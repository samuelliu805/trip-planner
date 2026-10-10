import assert from "node:assert/strict";

export async function pressCloudbaseElement(browser, elementExpression, label, { waitFor }) {
  await waitFor(
    browser,
    `(() => {
      const element = (${elementExpression});
      if (!element || !element.getClientRects().length || element.disabled) return false;
      if (!Object.keys(element).some(key => key.startsWith("__reactProps$"))) return false;
      element.focus();
      return document.activeElement === element;
    })()`,
    `${label} keyboard focus`,
  );
  for (const type of ["rawKeyDown", "keyUp"])
    await browser.cdp.send(
      "Input.dispatchKeyEvent",
      { code: "Enter", key: "Enter", type, windowsVirtualKeyCode: 13 },
      browser.sessionId,
    );
}

/** Re-read the selector after scrolling/frame work; React may replace the original node. */
export async function clickCloudbaseElement(
  browser,
  elementExpression,
  label,
  { evaluate, waitFor, button = "left", movePointer = false },
) {
  const measurement = `(async () => {
    let element = (${elementExpression});
    if (!element || !element.getClientRects().length || element.disabled)
      return { available: false, reason: "missing-or-hidden" };
    element.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    element = (${elementExpression});
    if (!element || !element.getClientRects().length || element.disabled)
      return { available: false, reason: "replaced-or-hidden" };
    for (let node = element; node; node = node.parentElement)
      if (node.getAnimations().some(animation => ["pending", "running"].includes(animation.playState)))
        return { available: false, reason: "animating" };
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (!rect.width || !rect.height || x < 0 || y < 0 || x > innerWidth || y > innerHeight)
      return { available: false, reason: "outside-viewport", rect: rect.toJSON(),
        viewport: { height: innerHeight, width: innerWidth } };
    const hit = document.elementFromPoint(x, y);
    if (!hit || (hit !== element && !element.contains(hit)))
      return { available: false, reason: "covered", rect: rect.toJSON(),
        hit: hit ? { className: String(hit.className).slice(0, 160), tagName: hit.tagName } : null };
    window.__phase3LastClick = {};
    for (const type of ['pointerdown', 'pointerup', 'click'])
      document.addEventListener(type, (event) => {
        window.__phase3LastClick[type] = { trusted: event.isTrusted,
          expectedTarget: event.composedPath().includes(element) };
      }, { once: true, capture: true });
    return { available: true, x, y };
  })()`;
  let point;
  try {
    point = await waitFor(
      browser,
      `${measurement}.then(point => {
        window.__phase3ClickPoint = point; return point.available ? point : false;
      })`,
      `${label} stable pointer target`,
    );
  } catch (error) {
    const diagnostic = await evaluate(browser, "window.__phase3ClickPoint").catch(() => null);
    throw new Error(`${label} was not available: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  assert(point?.available, `${label} was not available: ${JSON.stringify(point)}`);
  if (movePointer)
    await browser.cdp.send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: point.x, y: point.y },
      browser.sessionId,
    );
  for (const type of ["mousePressed", "mouseReleased"])
    await browser.cdp.send(
      "Input.dispatchMouseEvent",
      { button, clickCount: 1, type, x: point.x, y: point.y },
      browser.sessionId,
    );
}
