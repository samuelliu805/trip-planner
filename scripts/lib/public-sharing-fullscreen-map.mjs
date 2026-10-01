import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";
import { touchDrag } from "./public-sharing-mobile-gestures.mjs";

export async function verifyFullScreenMap({ page, app, token, directory, requests }) {
  const ownerStyles = await readFile(
    new URL("../../src/app/planner-workspace.css", import.meta.url),
    "utf8",
  );
  for (const width of [900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate((css) => {
      const style = document.createElement("style");
      style.textContent = css;
      const map = document.createElement("div");
      map.style.cssText = "position:fixed;inset:0;z-index:80";
      const panel = document.createElement("section");
      panel.className = "map-bottom-panel overview-route-panel";
      panel.style.cssText = "position:absolute;bottom:12px;left:12px;right:12px;height:120px";
      map.append(panel);
      document.head.append(style);
      document.body.append(map);
      const rect = panel.getBoundingClientRect();
      const result = {
        left: rect.left,
        right: innerWidth - rect.right,
        bottom: innerHeight - rect.bottom,
      };
      map.remove();
      style.remove();
      return result;
    }, ownerStyles);
    assert.ok(
      Object.values(geometry).every((gap) => Math.abs(gap - 16) <= 1),
      `Owner map routes stay at the bottom across desktop widths: ${JSON.stringify(geometry)}`,
    );
  }
  for (const template of ["ethereal", "journal"]) {
    const fixture = structuredClone(parisPublicItinerary);
    fixture.settings.templateId = template;
    fixture.settings.defaultView = "timeline";
    fixture.settings.showMapRoutes = true;
    fixture.settings.showPlacePhotos = true;
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
        item.place.googlePlaceId = `saved-map-place-${index}`;
        item.place.latitude = 48.85 + index * 0.001;
        item.place.longitude = 2.35 + index * 0.001;
      }
    });
    const secondDay = structuredClone(day);
    secondDay.ref = "b".repeat(64);
    secondDay.dayNumber = 2;
    secondDay.items.forEach((item, index) => {
      item.ref = (8000 + index).toString(16).padStart(64, "0");
      if (item.place) {
        item.place.latitude += 0.1;
        item.place.longitude += 0.1;
        if (item.type === "hotel") item.place.localityName = "Versailles";
      }
    });
    fixture.days = [day, secondDay];
    fixture.cityPhotoSources = [
      {
        dayRef: day.ref,
        ref: "9".repeat(64),
        googlePlaceId: "saved-city-Paris",
        name: "Paris",
      },
    ];
    for (const width of [390, 430]) {
      app.setFixture(fixture);
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${app.baseUrl}/share/${token}?view=timeline`);
      await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
      const trigger = page.getByRole("button", { name: "Open map and routes", exact: true });
      const coverImage = page
        .locator(
          template === "ethereal"
            ? "#public-timeline-panel .edition-front .edition-photo img"
            : "#public-timeline-panel .edition-day .edition-photo img",
        )
        .first();
      await coverImage.waitFor();
      const coverUrl = await coverImage.getAttribute("src");
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
      await map.locator("[data-mock-google-map=ready]").waitFor();
      await map.locator("[data-mock-google-pin=ready]").first().waitFor();
      await map.getByRole("button", { name: "Open route panel", exact: true }).click();
      const action = map.locator(".public-map-calculate");
      assert.ok(
        (await action.boundingBox()).y <
          (await map.locator(".public-map-panel .overflow-y-auto").boundingBox()).y,
        "The calculation action is pinned above the panel's scrolling route fields.",
      );
      assert.equal((await action.textContent()).trim(), "Explore route");
      await action.click();
      await map.getByRole("button", { name: "Calculate", exact: true }).waitFor();
      assert.ok(
        await action.isEnabled(),
        "Selecting local stops enables the panel calculation action.",
      );
      assert.equal(await map.getByRole("button", { name: "Calculate", exact: true }).count(), 1);
      assert.equal(
        await map
          .locator(".public-map-panel")
          .getByRole("button", { name: "Calculate", exact: true })
          .count(),
        1,
      );
      await map.getByRole("button", { name: "Whole trip", exact: true }).click();
      await map.getByRole("button", { name: "Calculate whole trip", exact: true }).waitFor();
      assert.ok(await action.isEnabled(), "Whole-trip calculation is available inside the panel.");
      assert.equal(await map.locator(".public-map-panel-toggle svg.lucide-x").count(), 0);
      const background = await map
        .locator(".public-map-panel")
        .evaluate((node) => getComputedStyle(node).backgroundColor);
      assert.equal(
        background,
        template === "journal" ? "rgb(245, 241, 229)" : "rgb(246, 245, 239)",
      );
      const drawer = map.locator(".public-map-panel");
      const panelBox = await drawer.boundingBox();
      assert.ok(panelBox.y >= 844 / 2, "Route setup occupies at most half the map.");
      assert.ok(panelBox.height <= (844 - canvas.y) * 0.52 + 1);
      if (directory)
        await page.screenshot({ path: `${directory}/${template}-fullscreen-map-${width}.png` });
      await map.getByRole("button", { name: "Day route", exact: true }).click();
      await action.click();
      await map.getByRole("button", { name: "Calculate", exact: true }).waitFor();
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
      const beforeReturn = requests ? { ...requests } : undefined;
      await map.getByRole("button", { name: "Back", exact: true }).click();
      await map.waitFor({ state: "hidden" });
      await page.waitForFunction(
        () => document.activeElement?.getAttribute("aria-label") === "Open map and routes",
      );
      assert.ok(await trigger.isVisible());
      assert.equal(
        await coverImage.getAttribute("src"),
        coverUrl,
        "Returning uses the same decoded photo.",
      );
      if (requests)
        assert.deepEqual(requests, beforeReturn, "Map return makes no photo or provider requests.");
      // Repeated SDK mounting and marker teardown must leave the reader and its pixels intact.
      for (let repeat = 0; repeat < 2; repeat++) {
        await trigger.click();
        await map.locator("[data-mock-google-pin=ready]").first().waitFor();
        await map.getByRole("button", { name: "Back", exact: true }).click();
        await map.waitFor({ state: "hidden" });
        assert.equal(await coverImage.getAttribute("src"), coverUrl);
        assert.equal(await page.getByText("This page couldn’t load", { exact: false }).count(), 0);
      }
      assert.equal(
        await page.evaluate(() => window.mockMapConstructions),
        1,
        "Repeated opens reuse the SDK map instead of creating another billable map load.",
      );
    }
    for (const width of [820, 1440]) {
      app.setFixture(fixture);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${app.baseUrl}/share/${token}?view=timeline`);
      await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
      if (width < 1200)
        await page.getByRole("button", { name: "Open map and routes", exact: true }).click();
      const workspace = page.locator(".public-map-workspace:visible");
      await workspace.locator("[data-mock-google-map=ready]").waitFor();
      await workspace.getByRole("button", { name: "Open route panel", exact: true }).click();
      const drawer = workspace.locator(".public-map-panel");
      const layout = await drawer.evaluate((node) => {
        const panel = node.getBoundingClientRect();
        const map = node.closest(".public-map-workspace").getBoundingClientRect();
        const handle = node.querySelector("[data-pull-up-handle]");
        return {
          top: panel.top - map.top,
          bottom: panel.bottom - map.bottom,
          right: panel.right - map.right,
          width: panel.width,
          mapWidth: map.width,
          dragHandle: Boolean(handle?.getClientRects().length),
        };
      });
      assert.ok(
        layout.top > 0 && Math.abs(layout.bottom) <= 1 && Math.abs(layout.right) <= 1,
        `Desktop routes return to the bottom of the map: ${JSON.stringify(layout)}`,
      );
      assert.ok(Math.abs(layout.width - layout.mapWidth) <= 1);
      assert.equal(layout.dragHandle, false);
      await workspace.getByRole("button", { name: "Whole trip", exact: true }).click();
      await workspace.getByRole("button", { name: "Calculate whole trip", exact: true }).waitFor();
      if (directory)
        await page.screenshot({ path: `${directory}/${template}-map-drawer-${width}.png` });
      await workspace.getByRole("button", { name: "Close route panel", exact: true }).click();
      assert.equal(await drawer.locator(".overflow-y-auto").count(), 0);
      if (width < 1200)
        await page
          .locator(".public-mobile-map")
          .getByRole("button", { name: "Back", exact: true })
          .click();
    }
  }
  console.log(
    "PASS fullscreen map: touch pans, panel calculation action, local route setup, content swipe and SDK marker teardown, photo reuse and focus restoration at 390/430px",
  );
}
