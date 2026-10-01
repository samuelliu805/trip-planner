import assert from "node:assert/strict";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";
import { journalPreviewIndexes } from "../../src/features/sharing/journal-chapters.ts";

export async function verifyEditorialPolish({ page, app, token, directory, photoDelay }) {
  for (const template of ["ethereal", "journal"]) {
    const fixture = structuredClone(parisPublicItinerary);
    fixture.settings.templateId = template;
    fixture.settings.defaultView = "timeline";
    fixture.settings.showMapRoutes = false;
    fixture.settings.showPlacePhotos = true;
    fixture.metadata.description = "11-day itinerary · View plans, tickets and routes";
    fixture.trip.dayCount = 6;
    fixture.days = Array.from({ length: 6 }, (_, index) => {
      const day = structuredClone(parisPublicItinerary.days[0]);
      day.ref = (100 + index).toString(16).padStart(64, "0");
      day.dayNumber = index + 1;
      day.notes = "";
      day.items = day.items.filter((item) => item.type !== "transport");
      day.items.forEach((item, order) => {
        item.ref = (1000 + index * 20 + order).toString(16).padStart(64, "0");
        item.notes = "";
        if (item.place) item.place.googlePlaceId = `saved-poi-${index}-${order}`;
        if (item.type === "hotel") {
          item.place.displayName = item.place.localityName = "Paris";
          item.place.googlePlaceId = "saved-city-Paris";
        }
      });
      if (index === 5) day.items = day.items.filter((item) => item.type === "hotel");
      return day;
    });
    const flight = {
      ref: "f".repeat(64),
      type: "flight",
      title: "CHC → SHA",
      sortOrder: 10,
      startTime: "11:35:00",
      transport: {
        origin: "克赖斯特彻奇国际机场 — International departures",
        destination: "上海虹桥国际机场 — Domestic connections",
        serviceNumber: "CZ 8374 / CZ 3525",
      },
      links: [{ label: "Booking", url: "https://example.invalid/booking" }],
    };
    fixture.days[0].items.push(
      flight,
      ...Array.from({ length: 3 }, (_, index) => ({
        ref: (2000 + index).toString(16).padStart(64, "0"),
        type: "transport",
        title: "Drive",
        sortOrder: 11 + index,
      })),
    );
    app.setFixture(fixture);
    for (const width of [390, 430, 820, 1440]) {
      app.setFixture(fixture);
      await page.setViewportSize({ width, height: 1000 });
      photoDelay(250);
      await page.goto(`${app.baseUrl}/share/${token}?view=timeline`);
      const panel = page.locator("#public-timeline-panel");
      await panel.waitFor({ state: "visible" });
      await panel.locator(".edition-front .edition-photo img").waitFor();
      assert.equal(await panel.locator(".edition-cover-description").count(), 0);
      if (template === "ethereal") {
        const geometry = await panel.evaluate((node) => {
          const cover = node.querySelector(".edition-front").getBoundingClientRect();
          const reader = node.querySelector(".public-view-scroll").getBoundingClientRect();
          const count = node.querySelector(".edition-cover-count");
          return {
            left: cover.left - reader.left,
            right: cover.right - reader.right,
            position: getComputedStyle(count).position,
            coverBottom: cover.bottom,
            countBottom: count.getBoundingClientRect().bottom,
            columns: getComputedStyle(node.querySelector(".edition-editorial-spread"))
              .gridTemplateColumns,
            chaptersLeft: node.querySelector(".edition-chapters").getBoundingClientRect().left,
            coverRight: cover.right,
          };
        });
        if (width < 720)
          assert.ok(
            Math.abs(geometry.left) <= 1 && Math.abs(geometry.right) <= 1,
            JSON.stringify(geometry),
          );
        else
          assert.ok(
            geometry.chaptersLeft > geometry.coverRight + 20,
            "Desktop cover and continuous chapters form separate columns.",
          );
        assert.equal(geometry.position, "static");
        assert.ok(geometry.countBottom <= geometry.coverBottom);
        if (directory)
          await page.screenshot({ path: `${directory}/ethereal-timeline-${width}.png` });
      }
      // A jump stays selected while late images insert content above the chapter.
      await panel.locator(".edition-dates button").nth(4).click();
      const sampled = await panel.evaluate(async (node) => {
        const values = [];
        for (let index = 0; index < 35; index++) {
          await new Promise((resolve) => setTimeout(resolve, 16));
          values.push(node.querySelector(".edition-dates [aria-current=date]")?.textContent);
        }
        return values;
      });
      assert.ok(
        sampled.every((value) => value.includes("Day 5")),
        `Date jump flickered: ${JSON.stringify(sampled)}`,
      );
      await panel.locator(".edition-dates button").last().click();
      await panel.locator(".edition-day").last().locator(".edition-photo img").waitFor();
      await panel.locator(".public-view-scroll").evaluate((node) => {
        node.dispatchEvent(new WheelEvent("wheel"));
        node.scrollTop = node.scrollHeight;
      });
      await page.waitForFunction(() =>
        document
          .querySelector("#public-timeline-panel .edition-dates [aria-current=date]")
          ?.textContent.includes("Day 6"),
      );
      const tail = await panel.locator(".public-view-scroll").evaluate((node) => {
        const last = node.querySelector(".edition-day:last-child");
        return {
          gap:
            node.querySelector(".itinerary-edition").getBoundingClientRect().bottom -
            last.getBoundingClientRect().bottom,
          minHeight: getComputedStyle(last).minHeight,
        };
      });
      assert.ok(tail.gap <= 45, `No artificial final viewport: ${JSON.stringify(tail)}`);
      assert.equal(tail.minHeight, "0px");
      await panel.locator(".edition-dates button").first().click();
      await panel.locator(".edition-day").first().locator(".edition-photo img").waitFor();
      const transfers = panel.locator(".edition-transfer");
      assert.equal(await transfers.count(), 4);
      for (const transfer of await transfers.all()) {
        const box = await transfer.boundingBox();
        assert.ok(box.height <= ((await transfer.textContent()).includes("Booking") ? 300 : 80));
      }
      const link = transfers.first().locator(".public-inline-links a");
      assert.equal(await link.getAttribute("href"), "https://example.invalid/booking");
      assert.ok((await link.boundingBox()).height >= 44);
      assert.equal(await transfers.first().locator(".public-resource-button").count(), 0);
      await transfers.first().locator("button").click();
      const sheet = page.getByRole("dialog");
      await sheet.waitFor();
      await sheet.evaluate(async (node) => {
        await Promise.all(
          node.getAnimations().map((animation) => animation.finished.catch(() => {})),
        );
      });
      const detail = sheet.locator(".public-item-detail");
      assert.ok(!(await detail.textContent()).includes("Flight"));
      const layout = await sheet.evaluate((node) => {
        const route = node.querySelector(".public-transport-route");
        const values = [...route.children].map(
          (row) => row.children[1].getBoundingClientRect().left,
        );
        return {
          values,
          gap:
            node.querySelector(".public-item-detail").getBoundingClientRect().top -
            node.querySelector("h2").getBoundingClientRect().bottom,
          overflow: node.scrollWidth > node.clientWidth,
        };
      });
      assert.ok(Math.abs(layout.values[0] - layout.values[1]) <= 1);
      assert.ok(layout.gap >= 20, JSON.stringify(layout));
      assert.equal(layout.overflow, false);
      if (directory)
        await page.screenshot({ path: `${directory}/${template}-flight-${width}.png` });
      await sheet.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("tab", { name: "Overview", exact: false }).click();
      const overview = page.locator("#public-overview-panel");
      await overview.locator(".edition-front .edition-photo img").waitFor();
      if (template === "journal") {
        assert.equal(await overview.locator(".journal-quick-overview button").count(), 3);
        const previewDay = fixture.days[journalPreviewIndexes(fixture.days)[1]].dayNumber;
        await overview.locator(".journal-quick-overview button").nth(1).click();
        await page.waitForFunction(
          (previewDay) =>
            document
              .querySelector("#public-timeline-panel .edition-dates [aria-current=date]")
              ?.textContent.includes(`Day ${previewDay}`),
          previewDay,
        );
        await page.getByRole("tab", { name: "Overview", exact: false }).click();
      } else {
        const geometry = await overview.evaluate((node) => {
          const cover = node.querySelector(".edition-front").getBoundingClientRect();
          const reader = node.querySelector(".public-view-scroll").getBoundingClientRect();
          const copy = node.querySelector(".edition-cover-copy").getBoundingClientRect();
          const visual = node.querySelector(".edition-cover-visual").getBoundingClientRect();
          const image = node.querySelector(".edition-front img").getBoundingClientRect();
          return {
            left: cover.left - reader.left,
            right: cover.right - reader.right,
            columns: copy.right <= visual.left + 1,
            aligned: Math.abs((copy.top + copy.bottom - visual.top - visual.bottom) / 2) <= 1,
            photoFillsColumn:
              Math.abs(image.left - visual.left) <= 1 && Math.abs(image.right - cover.right) <= 1,
          };
        });
        assert.ok(Math.abs(geometry.left) <= 1 && Math.abs(geometry.right) <= 1);
        assert.ok(
          geometry.columns && geometry.aligned && geometry.photoFillsColumn,
          `Aligned full-width overview with side-by-side copy and photo: ${JSON.stringify(geometry)}`,
        );
      }
      await overview.locator(".public-view-scroll").evaluate((node) => {
        node.scrollTop = 0;
      });
      if (directory) await page.screenshot({ path: `${directory}/${template}-cover-${width}.png` });
      photoDelay(0);
      const short = structuredClone(fixture);
      short.settings.showPlacePhotos = false;
      short.days.slice(4).forEach((day) => {
        day.items = day.items.filter((item) => item.type === "hotel");
      });
      app.setFixture(short);
      await page.goto(`${app.baseUrl}/share/${token}?view=timeline`);
      await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
      await panel.locator(".edition-dates button").nth(4).click();
      await panel.locator(".edition-day").nth(4).locator("h3").tap();
      await page.waitForFunction(() =>
        document
          .querySelector("#public-timeline-panel .edition-dates [aria-current=date]")
          ?.textContent.includes("Day 5"),
      );
      assert.ok(
        await panel
          .locator(".public-view-scroll")
          .evaluate(
            (node) => Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop) <= 1,
          ),
        "The selected penultimate day is clamped at the end without a spacer.",
      );
      const afterTap = await panel.locator(".edition-dates [aria-current=date]").textContent();
      assert.ok(afterTap.includes("Day 5"), "Tapping content does not release the selected day.");
      await panel.locator(".public-view-scroll").evaluate((node) => {
        node.dispatchEvent(new WheelEvent("wheel"));
      });
      await page.waitForFunction(() =>
        document
          .querySelector("#public-timeline-panel .edition-dates [aria-current=date]")
          ?.textContent.includes("Day 6"),
      );
    }
    console.log(
      `PASS ${template} city cover, daily photos, date stability, compact transport, sheet layout and overview`,
    );
  }
}
