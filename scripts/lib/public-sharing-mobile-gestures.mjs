import assert from "node:assert/strict";

async function touchDrag(page, start, end, steps = 10) {
  const client = await page.context().newCDPSession(page);
  const point = (x, y) => [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 1 }];
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: point(start.x, start.y),
  });
  for (let index = 1; index <= steps; index++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: point(
        start.x + ((end.x - start.x) * index) / steps,
        start.y + ((end.y - start.y) * index) / steps,
      ),
    });
    await page.waitForTimeout(16);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();
}

export async function verifyPagedReaderAndSheet(page, fixture) {
  const reader = page.locator("#public-timeline-panel .edition-paged-scroll");
  const box = await reader.boundingBox();
  const start = { x: box.x + box.width * 0.8, y: box.y + 160 };
  await touchDrag(page, start, { x: box.x + box.width * 0.2, y: start.y + 8 });
  await page.waitForFunction(
    (ref) =>
      document.querySelector("#public-timeline-panel .edition-day")?.dataset.publicDayRef === ref,
    fixture.days[1].ref,
  );
  assert.ok(
    (await page.locator(".edition-pager-current").textContent()).includes(
      `Day ${fixture.days[1].dayNumber}`,
    ),
  );
  assert.equal(
    await page.locator("[role=dialog]").count(),
    0,
    "A chapter swipe never opens an item.",
  );
  await page.getByRole("button", { name: "Choose day", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: new RegExp(`Day ${fixture.days[0].dayNumber}`) })
    .click();
  await page.locator("#public-timeline-panel .edition-plan-button").first().click();
  const panel = page.locator("[role=dialog].mobile-pull-up-panel");
  await panel.waitFor();
  await panel.evaluate((node) =>
    Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
  assert.equal(
    await panel.locator(".edition-plan-list").count(),
    0,
    "Details have their own full-width layout.",
  );
  const body = await panel.locator(".public-item-detail").boundingBox();
  const surface = await panel.boundingBox();
  assert.ok(body.width >= surface.width - 50, "Item details fill the sheet's reading width.");
  const scroller = panel.locator(".overflow-y-auto");
  const content = await scroller.boundingBox();
  const initialTop = surface.y;
  const nativeScrollStart = { x: content.x + 40, y: content.y + 240 };
  await touchDrag(page, nativeScrollStart, {
    x: nativeScrollStart.x,
    y: nativeScrollStart.y - 160,
  });
  assert.ok(
    await scroller.evaluate((node) => node.scrollTop > 20),
    "Upward touch scroll stays native inside the sheet.",
  );
  const scrolledTop = (await panel.boundingBox()).y;
  assert.ok(
    Math.abs(scrolledTop - initialTop) < 2,
    `Scrolling content does not move the sheet: ${JSON.stringify({ initialTop, scrolledTop, scroll: await scroller.evaluate((node) => node.scrollTop) })}`,
  );
  await scroller.evaluate((node) => {
    node.scrollTop = 35;
  });
  const point = { x: content.x + 40, y: content.y + 100 };
  await touchDrag(page, point, { x: point.x, y: Math.min(834, point.y + 320) });
  await panel.waitFor({ state: "hidden" });
}
