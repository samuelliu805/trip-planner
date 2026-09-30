import { existsSync } from "node:fs";
import {
  startPublicSharingDesignRuntime,
  designSessionCookie,
} from "./lib/public-sharing-design-runtime.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { parisPublicItinerary } from "../src/features/landing/landing-public-fixture.ts";
const token = "11111111-1111-4111-8111-111111111111";
const directory = process.env.PUBLIC_SHARING_DESIGN_ARTIFACT_DIR;
if (directory) await mkdir(directory, { recursive: true });
const app = await startPublicSharingDesignRuntime();
const executablePath = [
  process.env.CHROME_PATH,
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].find((path) => path && existsSync(path));
assert.ok(executablePath, "Chromium is required.");
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push({ message: e.message, stack: e.stack, url: page.url() }));
  const requests = { resolve: 0, media: 0, external: 0 };
  page.on("request", (r) => {
    if (/googleapis|generativelanguage|openai.com|anthropic/.test(r.url())) requests.external++;
  });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#b4c9c0"/><path d="M0 410L240 250 470 420 620 220 800 390V600H0" fill="#527368"/><circle cx="650" cy="140" r="60" fill="#eee5d4"/><text x="30" y="560" font-family="sans-serif" font-size="22" fill="white">Controlled place photo · test only</text></svg>';
  await page.route("**/api/public-place-photo/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("resolve")) {
      requests.resolve++;
      const itemRef = url.pathname.split("/").at(-1);
      await route.fulfill({
        json: {
          id: `google-place:${itemRef}`,
          kind: "image",
          source: "google_place",
          url: `/api/public-place-photo/${token}/${itemRef}?photo=places/mock/photos/test&signature=${"a".repeat(64)}`,
          attributions: [{ label: "Test author", url: "https://example.invalid/author" }],
          sourceUrl: "https://www.google.com/maps/search/?api=1&query=mock",
        },
      });
    } else {
      requests.media++;
      await route.fulfill({ contentType: "image/svg+xml", body: svg });
    }
  });
  const report = [];
  for (const template of ["journal", "ethereal"])
    for (const photos of [false, true]) {
      const fixture = structuredClone(parisPublicItinerary);
      fixture.metadata.description = "";
      fixture.settings.templateId = template;
      fixture.settings.showMapRoutes = false;
      fixture.settings.showPlacePhotos = photos;
      if (photos)
        fixture.days.forEach((day) =>
          day.items
            .filter((i) => i.type === "activity")
            .forEach((i) => (i.place.googlePlaceId = "saved-place-" + day.dayNumber)),
        );
      for (const day of fixture.days) {
        day.notes = "  ";
        for (const item of day.items) item.notes = "";
      }
      app.setFixture(fixture);
      for (const [width, height] of [
        [390, 844],
        [430, 932],
        [768, 1024],
        [820, 1180],
        [1024, 768],
        [1180, 820],
        [1440, 1000],
      ]) {
        await page.setViewportSize({ width, height });
        await page.goto(`${app.baseUrl}/share/${token}`);
        await page.locator(".itinerary-edition").first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        if (photos) {
          await page
            .locator("#public-overview-panel .edition-day")
            .first()
            .scrollIntoViewIfNeeded();
          await page.locator("#public-overview-panel .edition-photo").first().waitFor();
          await page
            .locator("#public-overview-panel .public-view-scroll")
            .evaluate((n) => (n.scrollTop = 0));
        }
        for (const view of ["overview", "timeline"]) {
          await page.getByRole("tab", { name: view, exact: false }).click();
          const selector = `#public-${view}-panel`;
          assert.equal(await page.locator(selector + " .edition-note").count(), 0);
          const data = await page.evaluate((sel) => {
            window.scrollTo(100, 100);
            const panel = document.querySelector(sel);
            const shell = document.querySelector(".public-itinerary-shell");
            return {
              scrollY,
              bodyHeight: document.documentElement.scrollHeight,
              height: innerHeight,
              width: innerWidth,
              bodyWidth: document.documentElement.scrollWidth,
              notes: panel.querySelectorAll(".edition-note").length,
              refs: [...panel.querySelectorAll("[data-public-item-ref]")].map(
                (n) => n.dataset.publicItemRef,
              ),
              header: document.querySelector(".public-itinerary-header").getBoundingClientRect()
                .top,
              shellBottom: shell.getBoundingClientRect().bottom,
            };
          }, selector);
          assert.equal(data.scrollY, 0);
          assert.ok(data.bodyWidth <= width);
          assert.ok(Math.abs(data.header) < 1);
          assert.ok(Math.abs(data.shellBottom - height) < 1);
          assert.deepEqual(
            new Set(data.refs),
            new Set(fixture.days.flatMap((d) => d.items).map((i) => i.ref)),
          );
          assert.equal(data.refs.length, new Set(data.refs).size);
          if (directory && [390, 820, 1440].includes(width)) {
            await page.screenshot({
              path: `${directory}/${template}-${view}-${width}-${photos ? "photo" : "no-photo"}.png`,
            });
            await page.locator(selector + " .public-view-scroll").evaluate((n) => {
              n.scrollTop = 400;
            });
            await page.screenshot({
              path: `${directory}/${template}-${view}-${width}-${photos ? "photo" : "no-photo"}-day.png`,
            });
            await page.locator(selector + " .public-view-scroll").evaluate((n) => {
              n.scrollTop = 0;
            });
          }
          report.push({ template, photos, view, width, height, frame: "pass", itemOrder: "pass" });
        }
        const before = { ...requests };
        await page.getByRole("tab", { name: "Table", exact: true }).click();
        if (width >= 768 && width <= 1180) {
          const frame = await page.locator(".public-matrix").evaluate((matrix) => {
            const rows = [...matrix.querySelectorAll('[role="row"]')];
            const header = rows[0].getBoundingClientRect();
            const first = rows[1].getBoundingClientRect();
            const last = rows.at(-1).getBoundingClientRect();
            const nav = document
              .querySelector(".public-template-region-view-navigation")
              .getBoundingClientRect();
            matrix.scrollLeft = 140;
            const frozen = [
              matrix.querySelector('[role="columnheader"]'),
              matrix.querySelector(".matrix-date-column"),
            ].map((node) => {
              const rect = node.getBoundingClientRect();
              return { left: rect.left, width: rect.width };
            });
            return { gap: first.top - header.bottom, bottom: last.bottom, nav: nav.top, frozen };
          });
          assert.ok(Math.abs(frame.gap) <= 1, "Matrix first row meets its header.");
          assert.ok(Math.abs(frame.bottom - frame.nav) <= 1, "Short Matrix reaches navigation.");
          assert.ok(Math.abs(frame.frozen[0].left - frame.frozen[1].left) <= 1);
          assert.ok(Math.abs(frame.frozen[0].width - frame.frozen[1].width) <= 1);
        }
        await page.getByRole("tab", { name: "Overview", exact: true }).click();
        assert.equal(requests.resolve, before.resolve);
        assert.equal(requests.media, before.media);
        if (template === "journal") {
          const columns = await page
            .locator("#public-overview-panel .journal-day-spread")
            .first()
            .evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(" ").length);
          assert.equal(columns, photos && width > 620 ? 2 : 1);
        }
      }
      console.log(
        `PASS ${template} ${photos ? "photos" : "no photos"} responsive overview/timeline and media reuse`,
      );
    }
  // Explicit chapter selection enters the same-page timeline and reaches the day.
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.locator("#public-overview-panel .edition-contents button").nth(2).click();
  assert.equal(
    await page.getByRole("tab", { name: "Timeline", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  await page.locator("#public-timeline-panel .edition-plan-button").last().click();
  await page.locator("[role=dialog]").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("[role=dialog]").waitFor({ state: "hidden" });
  // Share dialog must overlay table frozen layers.
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await page.getByRole("button", { name: "Share itinerary", exact: true }).click();
  await page.locator("[role=dialog]").waitFor();
  assert.ok(await page.locator("[role=dialog]").isVisible());
  await page.keyboard.press("Escape");

  // Blank, notes-only, long-text, and failed-photo states never create an empty photo column.
  for (const templateId of ["ethereal", "journal"]) {
    for (const scenario of ["blank", "notes-only", "long-text", "failed-photo"]) {
      const fixture = structuredClone(parisPublicItinerary);
      fixture.settings.templateId = templateId;
      fixture.settings.showMapRoutes = true;
      fixture.settings.showPlacePhotos = scenario === "failed-photo";
      fixture.metadata.description = "";
      fixture.days = [fixture.days[0]];
      if (scenario === "blank" || scenario === "notes-only") fixture.days[0].items = [];
      if (scenario === "notes-only" || scenario === "long-text")
        fixture.days[0].notes = "Actual shared note. ".repeat(scenario === "long-text" ? 150 : 1);
      if (scenario === "long-text")
        fixture.days[0].items[1].title = "A long stored itinerary title ".repeat(6);
      if (scenario === "failed-photo") {
        fixture.days[0].items[2].place.googlePlaceId = "saved-photo-source";
        await page.route("**/api/public-place-photo/**", (route) => route.fulfill({ status: 429 }));
      }
      app.setFixture(fixture);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${app.baseUrl}/share/${token}`);
      await page.locator(".itinerary-edition").first().waitFor();
      await page.locator("#public-overview-panel .edition-day").scrollIntoViewIfNeeded();
      if (scenario === "blank" || scenario === "failed-photo")
        assert.equal(await page.locator("#public-overview-panel .edition-note").count(), 0);
      if (scenario === "blank")
        assert.equal(await page.locator("#public-overview-panel .edition-plan").count(), 0);
      if (templateId === "journal")
        assert.equal(
          await page
            .locator("#public-overview-panel .journal-day-spread")
            .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length),
          1,
        );
      if (scenario === "long-text") {
        await page.locator("#public-overview-panel .edition-note summary").click();
        assert.equal(
          await page.locator("#public-overview-panel .edition-note p").textContent(),
          fixture.days[0].notes,
        );
      }
      await page.getByRole("button", { name: "Open map and routes", exact: true }).click();
      const panel = page.locator(".public-map-pull-up");
      await panel.waitFor();
      const handle = panel.locator("[data-pull-up-handle]");
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 5 });
      await handle.dispatchEvent("pointercancel");
      await page.mouse.up();
      await panel.waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".public-map-pull-up")?.hasAttribute("data-pull-up-dragging"),
      );
      assert.equal(await panel.getAttribute("data-pull-up-dragging"), null);
      // Content gestures do not capture the handle-only close behavior.
      const content = await panel.locator(".public-map-workspace").boundingBox();
      await page.mouse.move(content.x + 40, content.y + 40);
      await page.mouse.down();
      await page.mouse.move(content.x + 40, content.y + 240, { steps: 5 });
      await page.mouse.up();
      assert.ok(await panel.isVisible());
      const closeBox = await handle.boundingBox();
      await page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + 10);
      await page.mouse.down();
      await page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + 310, { steps: 10 });
      await page.mouse.up();
      await panel.waitFor({ state: "hidden" });
      await page.waitForFunction(
        () => document.activeElement?.getAttribute("aria-label") === "Open map and routes",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Open map and routes", exact: true })
          .evaluate((node) => node === document.activeElement),
        true,
      );
    }
  }
  // Real /trips rendering, filters, role-dependent menu entries, and stable local artwork.
  await page.context().addCookies([designSessionCookie()]);
  await page.goto(`${app.baseUrl}/trips`);
  await page.getByRole("button", { name: "Actions for Paris Trip" }).waitFor();
  const artwork = await page
    .locator("#trip-list svg path[stroke-dasharray]")
    .first()
    .getAttribute("stroke");
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await page.getByRole("button", { name: "Actions for A shared trip" }).waitFor();
  await page.getByRole("button", { name: "Actions for A shared trip" }).click();
  assert.equal(await page.getByRole("menuitem", { name: "Delete trip", exact: true }).count(), 0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Actions for Paris Trip" }).waitFor();
  assert.equal(
    await page.locator("#trip-list svg path[stroke-dasharray]").first().getAttribute("stroke"),
    artwork,
  );
  await page.getByRole("button", { name: "Actions for Paris Trip" }).click();
  assert.ok(await page.getByRole("menuitem", { name: "Delete trip", exact: true }).isVisible());
  await page.keyboard.press("Escape");
  assert.ok(
    await page.getByRole("link", { name: "Open Paris Trip", exact: true }).getAttribute("href"),
  );
  assert.equal(requests.external, 0);
  assert.deepEqual(errors, []);
  if (directory)
    await writeFile(
      `${directory}/browser-report.json`,
      JSON.stringify({ cases: report, requests, errors }, null, 2) + "\n",
    );
  console.log(
    "PASS 56 responsive cases, explicit chapters/details, overlay, no AI/Google requests",
  );
} finally {
  await browser.close();
  await app.close();
}
