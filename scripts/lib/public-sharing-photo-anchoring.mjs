import assert from "node:assert/strict";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";

export async function verifyPhotoAnchoringAndFields({ page, app, token, photoGate }) {
  for (const template of ["ethereal", "journal"]) {
    const fixture = structuredClone(parisPublicItinerary);
    fixture.settings.templateId = template;
    fixture.settings.defaultView = "timeline";
    fixture.settings.showMapRoutes = false;
    fixture.settings.showPlacePhotos = true;
    fixture.trip.dayCount = 12;
    fixture.days = Array.from({ length: 12 }, (_, index) => {
      const day = structuredClone(parisPublicItinerary.days[0]);
      day.ref = (300 + index).toString(16).padStart(64, "0");
      day.dayNumber = index + 1;
      day.notes = index === 2 ? "A real shared note, written on the road." : "";
      day.items = day.items.filter((item) => item.type !== "transport");
      day.items.forEach((item, order) => {
        item.ref = (3000 + index * 20 + order).toString(16).padStart(64, "0");
        if (item.place) item.place.googlePlaceId = `saved-place-${index}-${order}`;
        if (item.type === "hotel") {
          item.place.displayName = item.place.localityName = "Paris";
          item.place.googlePlaceId = "saved-city-Paris";
        }
      });
      return day;
    });
    for (const width of [390, 430, 820, 1440]) {
      app.setFixture(fixture);
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${app.baseUrl}/share/${token}?view=timeline`);
      const panel = page.locator("#public-timeline-panel");
      await panel.locator(".edition-front .edition-photo img").waitFor();
      if (template === "ethereal") {
        const edges = await panel.locator(".edition-front").evaluate((node) => {
          const card = node.getBoundingClientRect();
          const image = node.querySelector(".edition-photo img").getBoundingClientRect();
          return { left: image.left - card.left, right: image.right - card.right };
        });
        assert.ok(
          Math.abs(edges.left) <= 1 && Math.abs(edges.right) <= 1,
          `Full-width cover pixels: ${JSON.stringify(edges)}`,
        );
      }
      photoGate.hold();
      try {
        await panel.locator(".edition-dates button").nth(2).click();
        await page.waitForFunction(() =>
          document
            .querySelector("#public-timeline-panel .edition-dates [aria-current=date]")
            ?.textContent.includes("Day 3"),
        );
        // Allow IntersectionObserver to start the deliberately blocked media fetch.
        for (let attempt = 0; !photoGate.held() && attempt < 20; attempt++)
          await page.waitForTimeout(50);
        assert.ok(
          photoGate.held() > 0,
          "At least one photo above the target is actually in flight.",
        );
        await panel.locator(".edition-dates button").nth(7).click();
        await page.waitForFunction(() =>
          document
            .querySelector("#public-timeline-panel .edition-dates [aria-current=date]")
            ?.textContent.includes("Day 8"),
        );
        const target = panel.locator(".edition-day").nth(7);
        const before = await target.evaluate((node) => ({
          top: node.getBoundingClientRect().top,
          offset: node.offsetTop,
        }));
        const sampling = panel.evaluate(async (node) => {
          const target = node.querySelectorAll(".edition-day")[7];
          const values = [];
          window.photoAnchorSampling = true;
          for (let index = 0; index < 70; index++) {
            await new Promise(requestAnimationFrame);
            // ResizeObserver corrections run after RAF and before paint. Sample
            // the completed frame, not the transient pre-paint layout.
            await new Promise((resolve) => setTimeout(resolve, 0));
            values.push({
              top: target.getBoundingClientRect().top,
              day: node.querySelector(".edition-dates [aria-current=date]")?.textContent,
            });
          }
          window.photoAnchorSampling = false;
          return values;
        });
        await page.waitForFunction(() => window.photoAnchorSampling);
        photoGate.release();
        const samples = await sampling;
        await panel.locator(".edition-day").nth(2).locator(".edition-photo img").waitFor();
        const after = await target.evaluate((node) => ({
          top: node.getBoundingClientRect().top,
          offset: node.offsetTop,
        }));
        assert.ok(
          after.offset - before.offset > 100,
          "An above-target photo genuinely increased preceding content height.",
        );
        const drift = Math.max(
          ...samples.map(({ top }) => Math.abs(top - before.top)),
          Math.abs(after.top - before.top),
        );
        assert.ok(
          drift <= 2,
          `No visible frame jumps as photos arrive: ${template} ${width}px drift=${drift} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
        );
        assert.ok(
          samples.every(({ day }) => day.includes("Day 8")),
          "Header stays on the selected chapter.",
        );
      } finally {
        photoGate.release();
      }
      await panel.locator(".edition-dates button").first().click();
      await panel.locator(".edition-plan-button").first().click();
      const sheet = page.getByRole("dialog");
      await sheet.waitFor();
      const fields = await sheet.locator(".public-item-detail-field").evaluateAll((nodes) =>
        nodes.map((node) => {
          const icon = node.querySelector("svg").getBoundingClientRect();
          const copy = node.children[1];
          const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
          let text;
          while ((text = walker.nextNode()) && !text.textContent.trim()) {}
          const range = document.createRange();
          range.selectNodeContents(text);
          const first = range.getClientRects()[0];
          return {
            delta: Math.abs(icon.top + icon.height / 2 - first.top - first.height / 2),
            textLeft: first.left,
            iconLeft: icon.left,
          };
        }),
      );
      assert.ok(fields.length >= 2, "Inspect all populated category/time/place/note fields.");
      assert.ok(
        fields.every(({ delta }) => delta <= 4),
        `Icons align to the first text line: ${JSON.stringify(fields)}`,
      );
      assert.ok(fields.every(({ iconLeft }) => Math.abs(iconLeft - fields[0].iconLeft) <= 1));
      await sheet.getByRole("button", { name: "Close", exact: true }).click();
      if (template === "journal") {
        await page.getByRole("tab", { name: "Overview", exact: false }).click();
        const overview = page.locator("#public-overview-panel");
        const note = overview.locator(".edition-overview-day-card").nth(2).locator(".edition-note");
        assert.equal(await note.textContent(), fixture.days[2].notes);
        assert.equal(
          await overview
            .locator(".edition-overview-day-card")
            .nth(1)
            .locator(".edition-note")
            .count(),
          0,
          "Empty days do not invent notes.",
        );
        const paper = await note.evaluate((node) => ({
          background: getComputedStyle(node).backgroundColor,
          tape: getComputedStyle(node, "::before").content,
        }));
        assert.equal(paper.background, "rgb(244, 230, 185)");
        assert.equal(paper.tape, '""');
      }
    }
    console.log(
      `PASS ${template}: actual frame-by-frame late-photo anchoring and all detail-field alignment at 390/430/820/1440`,
    );
  }
}
