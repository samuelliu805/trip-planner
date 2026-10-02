import assert from "node:assert/strict";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";

export async function verifyFirstDayNavigation({ page, app, token }) {
  await page.addInitScript(() => {
    window.publicDayTouchLog = [];
    document.addEventListener(
      "click",
      (event) => {
        const button =
          event.target instanceof Element
            ? event.target.closest("button[data-public-day-target]")
            : null;
        if (button)
          window.publicDayTouchLog.push({
            type: "click",
            ref: button.dataset.publicDayTarget,
            ready: button.closest(".public-itinerary-shell")?.dataset.publicReaderReady,
          });
      },
      true,
    );
    document.addEventListener(
      "public-reader-ready",
      (event) => {
        window.publicDayTouchLog.push({
          type: "ready",
          intent: event.target.publicDayIntent,
        });
      },
      true,
    );
  });
  for (const template of ["ethereal", "journal"]) {
    const fixture = structuredClone(parisPublicItinerary);
    fixture.settings.templateId = template;
    fixture.settings.showPlacePhotos = true;
    fixture.days = Array.from({ length: 12 }, (_, index) => {
      const day = structuredClone(parisPublicItinerary.days[0]);
      day.ref = (100 + index).toString(16).padStart(64, "0");
      day.dayNumber = index + 1;
      day.items.forEach((item, order) => {
        item.ref = (1000 + index * 30 + order).toString(16).padStart(64, "0");
      });
      if (index >= 10) day.items = [];
      return day;
    });
    fixture.trip.dayCount = fixture.days.length;
    app.setFixture(fixture);
    for (const [width, height] of [
      [390, 844],
      [430, 932],
      [768, 1024],
      [820, 1180],
      [1024, 768],
      [1440, 900],
    ]) {
      for (const initialView of ["overview", "timeline", "chapter", "clamped"]) {
        const coldTimeline = initialView === "timeline";
        const firstIndex = initialView === "clamped" ? 10 : coldTimeline ? 1 : 7;
        await page.setViewportSize({ width, height });
        await page.goto(
          `${app.baseUrl}/share/${token}?view=${["chapter", "overview"].includes(initialView) ? "overview" : "timeline"}`,
          { waitUntil: coldTimeline ? "commit" : "load" },
        );
        if (!coldTimeline)
          await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
        if (initialView === "overview")
          await page.getByRole("tab", { name: "Timeline", exact: true }).click();
        if (initialView === "chapter")
          await page
            .locator(
              `#public-overview-panel [data-public-day-ref="${fixture.days[7].ref}"] .edition-overview-open`,
            )
            .tap();
        const panel = page.locator("#public-timeline-panel");
        await panel.waitFor({ state: "visible" });
        const dates = panel.locator(".edition-dates button");
        if (initialView === "clamped") {
          await panel.locator(".public-view-scroll").evaluate((node) => {
            node.dispatchEvent(new WheelEvent("wheel"));
            node.scrollTop = node.scrollHeight;
          });
          await page.waitForFunction(() =>
            document
              .querySelector("#public-timeline-panel .edition-dates [aria-current=date]")
              ?.textContent.includes("Day 12"),
          );
        }
        // No warm-up day selection: the first real touch must reach the requested chapter.
        if (initialView !== "chapter") await dates.nth(firstIndex).tap();
        await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
        await assertJump(page, fixture.days[firstIndex].ref, { template, width, initialView });
        await dates.nth(2).click();
        await assertJump(page, fixture.days[2].ref, { template, width, initialView });
        await dates.nth(5).focus();
        await page.keyboard.press("Enter");
        await assertJump(page, fixture.days[5].ref, { template, width, initialView });
        assert.equal(new URL(page.url()).searchParams.get("view"), "timeline");
      }
    }
    console.log(
      `PASS ${template} first touch, repeated and keyboard day jumps from Overview/Timeline at six viewports`,
    );
  }
}

async function assertJump(page, ref, context) {
  context = { ...context, touches: await page.evaluate(() => window.publicDayTouchLog.slice(-4)) };
  const samples = await page.locator("#public-timeline-panel").evaluate(async (panel, ref) => {
    const scroller = panel.querySelector(".public-view-scroll");
    const chapter = scroller.querySelector(`[data-public-day-ref="${ref}"]`);
    const samples = [];
    for (let frame = 0; frame < 30; frame++) {
      await new Promise(requestAnimationFrame);
      samples.push({
        selected: panel.querySelector(".edition-dates [aria-current=date]")?.textContent,
        top: chapter.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
        scroll: scroller.scrollTop,
        max: scroller.scrollHeight - scroller.clientHeight,
      });
    }
    return samples;
  }, ref);
  const day = Number.parseInt(ref, 16) - 99;
  assert.ok(
    samples.slice(2).every(({ selected }) => selected?.includes(`Day ${day}`)),
    `Selected date never resets: ${JSON.stringify({ ...context, day, samples })}`,
  );
  assert.ok(
    samples
      .slice(2)
      .every(({ top, scroll, max }) => Math.abs(top) <= 2 || Math.abs(scroll - max) <= 2),
    `First selection scrolls to its chapter and retains its anchor: ${JSON.stringify({ ...context, day, samples })}`,
  );
}
