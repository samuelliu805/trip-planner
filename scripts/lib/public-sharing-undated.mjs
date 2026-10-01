import assert from "node:assert/strict";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";

export async function verifyUndatedSharing({ page, app, token, directory }) {
  for (const [template, locale] of ["ethereal", "journal", "standard"].flatMap((template) =>
    ["en", "zh-CN"].map((locale) => [template, locale]),
  )) {
    const fixture = structuredClone(parisPublicItinerary);
    fixture.trip.startDate = null;
    fixture.trip.endDate = null;
    fixture.settings.templateId = template;
    fixture.settings.showPlacePhotos = false;
    fixture.settings.showMapRoutes = false;
    fixture.days.forEach((day) => {
      day.date = null;
    });
    app.setFixture(fixture);
    await page
      .context()
      .addCookies([{ name: "trip-planner-locale", value: locale, url: app.baseUrl }]);
    for (const width of [390, 430, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${app.baseUrl}/share/${token}`);
      await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.doesNotMatch(
        await page.locator(".public-trip-meta").innerText(),
        /Dates not set|Date TBD|日期未定|日期待定/,
      );
      for (const view of ["overview", "table", "timeline"]) {
        const tab =
          locale === "en" ? view : { overview: "概览", table: "表格", timeline: "时间线" }[view];
        await page.getByRole("tab", { name: tab, exact: false }).click();
        const panel = page.locator(`#public-${view}-panel`);
        await panel.waitFor({ state: "visible" });
        assert.doesNotMatch(await panel.innerText(), /Dates not set|Date TBD|日期未定|日期待定/);
        for (const day of fixture.days) {
          assert.match(
            await panel.locator(`[data-public-day-ref="${day.ref}"]`).first().innerText(),
            new RegExp(locale === "en" ? `Day ${day.dayNumber}` : `第${day.dayNumber}天`, "i"),
          );
        }
        if (template === "ethereal" && view === "overview") {
          const geometry = await panel.locator(".edition-front").evaluate((cover) => {
            const copy = cover.querySelector(".edition-cover-copy").getBoundingClientRect();
            const numeral = cover.querySelector(".edition-journey-numeral").getBoundingClientRect();
            const bounds = cover.getBoundingClientRect();
            return {
              copy: { right: copy.right, top: copy.top },
              numeral: { left: numeral.left, top: numeral.top, bottom: numeral.bottom },
              bottom: bounds.bottom,
              right: bounds.right,
            };
          });
          assert.ok(
            Math.abs(geometry.copy.top - geometry.numeral.top) <= 1,
            "No-photo numeral shares the title row.",
          );
          assert.ok(
            geometry.numeral.left >= geometry.copy.right - 1,
            "Numeral sits to the right of the title.",
          );
          assert.ok(
            geometry.numeral.bottom <= geometry.bottom + 1,
            "Numeral fits inside the compact cover.",
          );
          assert.ok(geometry.right <= width + 1, "Cover stays inside the viewport.");
          if (directory)
            await panel
              .locator(".edition-front")
              .screenshot({ path: `${directory}/ethereal-undated-${locale}-${width}.png` });
        }
      }
    }
  }
  await page.context().addCookies([{ name: "trip-planner-locale", value: "en", url: app.baseUrl }]);
  console.log(
    "Undated sharing passed across Overview, Table and Timeline at 390, 430, 820 and 1440px.",
  );
}
