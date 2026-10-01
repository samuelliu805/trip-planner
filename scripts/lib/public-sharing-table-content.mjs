import assert from "node:assert/strict";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";
import { transportModes, transportModeLabels } from "../../src/features/itinerary/types.ts";

export function measureMatrixContentAlignment(matrix) {
  return [...matrix.querySelectorAll('[role="row"]:not(.matrix-grid-header)')].flatMap((row) => {
    const date = row.querySelector('[role="rowheader"] .matrix-frozen-content');
    if (!date) return [];
    const origin =
      date.getBoundingClientRect().top + Number.parseFloat(getComputedStyle(date).paddingTop);
    const items = [...row.querySelectorAll('[role="gridcell"]')].flatMap((cell) => {
      const title = cell.querySelector(
        ".matrix-city-summary > span, [data-edit-item] > span, .public-item-focus > span",
      );
      return title
        ? [{ delta: title.getBoundingClientRect().top - origin, text: title.textContent }]
        : [];
    });
    const day = row.querySelector('[role="rowheader"]:nth-child(2) .matrix-frozen-content');
    if (day?.getClientRects().length)
      items.push({
        delta:
          day.getBoundingClientRect().top +
          Number.parseFloat(getComputedStyle(day).paddingTop) -
          origin,
        text: "Day",
      });
    return items;
  });
}

export async function verifyPublicTableContent({ page, app, token }) {
  const originalLocale = (await page.context().cookies(app.baseUrl)).find(
    (cookie) => cookie.name === "trip-planner-locale",
  );
  const translated = [
    "航班",
    "火车",
    "驾车",
    "大巴",
    "轮渡",
    "出租车",
    "出租车",
    "骑行",
    "步行",
    "地铁/轻轨",
    "有轨电车",
    "接驳车",
    "缆车",
    "摩托车",
    "其他",
  ];
  const fixture = structuredClone(parisPublicItinerary);
  fixture.settings.defaultView = "table";
  fixture.settings.showMapRoutes = false;
  fixture.settings.showPlacePhotos = false;
  fixture.days = fixture.days.slice(0, 1);
  fixture.days[0].items = [
    { ref: "a".repeat(64), type: "activity", title: "Table activity", sortOrder: 0 },
    ...transportModes.map((mode, i) => ({
      ref: (i + 1).toString(16).padStart(64, "0"),
      type: "transport",
      title: "Custom trip transfer",
      transport: { mode },
      sortOrder: i + 1,
    })),
    { ref: "b".repeat(64), type: "transport", title: "Drive", sortOrder: 16 },
    { ref: "c".repeat(64), type: "transport", title: "驾车", sortOrder: 17 },
  ];
  for (const template of ["standard", "bento", "ethereal", "journal", "neon", "traverse"]) {
    fixture.settings.templateId = template;
    if (template === "bento") fixture.settings.templateVersion = 2;
    else fixture.settings.templateVersion = 1;
    app.setFixture(fixture);
    for (const locale of ["en", "zh-CN"]) {
      await page
        .context()
        .addCookies([{ name: "trip-planner-locale", value: locale, url: app.baseUrl }]);
      for (const width of [390, 430, 768, 820, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${app.baseUrl}/share/${token}`);
        await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
        const matrix = page.locator(".public-matrix");
        await matrix.waitFor({ state: "visible" });
        await page.evaluate(() => document.fonts.ready);
        const alignment = await matrix.evaluate(measureMatrixContentAlignment);
        assert.ok(alignment.length >= 3);
        assert.ok(
          alignment.every(({ delta }) => Math.abs(delta) <= 1),
          `${template} ${locale} ${width}px content alignment: ${JSON.stringify(alignment)}`,
        );
        for (const [i, mode] of transportModes.entries()) {
          const item = matrix.locator(
            `[data-public-item-ref="${(i + 1).toString(16).padStart(64, "0")}"]`,
          );
          assert.equal(
            (await item.innerText()).trim(),
            locale === "en" ? transportModeLabels[mode] : translated[i],
          );
          assert.equal(await item.locator("svg").count(), 1, `${mode} has its editor icon`);
        }
        for (const ref of ["b", "c"]) {
          const item = matrix.locator(`[data-public-item-ref="${ref.repeat(64)}"]`);
          assert.equal((await item.innerText()).trim(), locale === "en" ? "Drive" : "驾车");
          assert.equal(await item.locator("svg").count(), 1);
        }
        const bounds = await matrix.evaluate((m) => ({
          header: m.querySelector(".matrix-grid-header").getBoundingClientRect().bottom,
          first: m.querySelector("[data-public-day-ref]").getBoundingClientRect().top,
        }));
        assert.ok(Math.abs(bounds.header - bounds.first) <= 1, "Header meets first row");
      }
    }
  }
  await page.context().addCookies([
    { name: "trip-planner-locale", value: originalLocale?.value ?? "en", url: app.baseUrl },
  ]);
  console.log(
    "Public Table modes, translations, icons and compact alignment passed for six templates and six widths in both locales.",
  );
}
