import assert from "node:assert/strict";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";
import { touchDrag } from "./public-sharing-mobile-gestures.mjs";

export async function verifyFullScreenMap({ page, app, token, directory }) {
  for (const template of ["ethereal", "journal"]) {
    const fixture = structuredClone(parisPublicItinerary);
    fixture.settings.templateId = template;
    fixture.settings.defaultView = "timeline";
    fixture.settings.showMapRoutes = true;
    fixture.settings.showPlacePhotos = false;
    fixture.settings.allowRouteExplore = true;
    const day = fixture.days[0];
    const activity = day.items.find((item) => item.type === "activity");
    day.items.push({
      ...structuredClone(activity),
      ref: "a".repeat(64),
      title: "City garden",
      sortOrder: 20,
    });
    day.items.forEach((item, index) => {
      if (item.place) {
        item.place.latitude = 48.85 + index * 0.001;
        item.place.longitude = 2.35 + index * 0.001;
      }
    });
    fixture.days = [day];
    for (const width of [390, 430]) {
      app.setFixture(fixture);
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${app.baseUrl}/share/${token}?view=timeline`);
      await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
      const trigger = page.getByRole("button", { name: "Open map and routes", exact: true });
      await trigger.click();
      const map = page.locator(".public-mobile-map");
      await map.waitFor();
      await map.evaluate((node) =>
        Promise.all(
          node.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
        ),
      );
      const initial = await map.boundingBox();
      assert.ok(
        Math.abs(initial.y) <= 1 && Math.abs(initial.height - 844) <= 1 && initial.width <= width,
      );
      const canvas = await map.locator(".public-map-canvas").boundingBox();
      assert.ok(canvas.y <= 64, "Back and map title share one compact header row.");
      await touchDrag(page, { x: 80, y: canvas.y + 100 }, { x: 80, y: canvas.y + 300 });
      assert.ok(await map.isVisible(), "A map touch pan never closes the fullscreen modal.");
      assert.ok(Math.abs((await map.boundingBox()).y - initial.y) <= 1);
      const action = map.locator(".public-map-calculate");
      assert.ok(
        (await action.boundingBox()).y < canvas.y + 60,
        "The route action is at the top of the map.",
      );
      assert.equal((await action.textContent()).trim(), "Explore route");
      await action.click();
      await map.getByRole("button", { name: "Calculate", exact: true }).waitFor();
      assert.ok(
        await action.isEnabled(),
        "Selecting local stops enables the top calculation action.",
      );
      assert.equal(await map.getByRole("button", { name: "Calculate", exact: true }).count(), 1);
      assert.equal(
        await map
          .locator(".public-map-panel")
          .getByRole("button", { name: "Calculate", exact: true })
          .count(),
        0,
      );
      const drawer = map.locator(".public-map-panel");
      const panelBox = await drawer.boundingBox();
      assert.ok(panelBox.y >= 844 / 2, "Route setup occupies at most half the map.");
      assert.ok(panelBox.height <= (844 - canvas.y) * 0.52 + 1);
      if (directory)
        await page.screenshot({ path: `${directory}/${template}-fullscreen-map-${width}.png` });
      // A content touch hands off to the drawer only at its scroll boundary.
      const body = drawer.locator(".overflow-y-auto");
      await body.evaluate((node) => {
        node.scrollTop = 0;
      });
      const content = await body.boundingBox();
      await touchDrag(
        page,
        { x: content.x + 25, y: content.y + 35 },
        { x: content.x + 25, y: Math.min(835, content.y + 235) },
      );
      await drawer.locator("[data-pull-up-handle]").waitFor({ state: "hidden" });
      assert.ok(await map.isVisible(), "Dismissing route setup keeps the map available.");
      await map.getByRole("button", { name: "Back", exact: true }).click();
      await map.waitFor({ state: "hidden" });
      await page.waitForFunction(
        () => document.activeElement?.getAttribute("aria-label") === "Open map and routes",
      );
      assert.ok(await trigger.isVisible());
    }
  }
  console.log(
    "PASS fullscreen map: touch pans, top calculation action, local route setup, content swipe and focus restoration at 390/430px",
  );
}
