import assert from "node:assert/strict";
import { build } from "esbuild";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";

function fixtureFor(template) {
  const fixture = structuredClone(parisPublicItinerary);
  fixture.settings = {
    ...fixture.settings,
    templateId: template,
    defaultView: "overview",
    showPlacePhotos: false,
    showMapRoutes: true,
    allowRouteExplore: true,
  };
  fixture.settings.templateVersion = template === "bento" ? 2 : 1;
  fixture.savedRoutes = [];
  fixture.days = Array.from({ length: 12 }, (_, index) => {
    const day = structuredClone(parisPublicItinerary.days[0]);
    day.ref = (100 + index).toString(16).padStart(64, "0");
    day.dayNumber = index + 1;
    day.title = null;
    day.items.forEach((item, order) => {
      item.ref = (1000 + index * 30 + order).toString(16).padStart(64, "0");
      if (item.place) {
        item.place.googlePlaceId = `saved-ux-${index}-${order}`;
        item.place.latitude = 48.85 + index * 0.01 + order * 0.001;
        item.place.longitude = 2.35 + index * 0.01 + order * 0.001;
      }
    });
    return day;
  });
  const lastHotel = fixture.days[2].items.findLast((item) => item.type === "hotel");
  lastHotel.place.localityName = "Tokyo";
  const activity = fixture.days[3].items.find((item) => item.type === "activity");
  fixture.days[3].items = ["箱根", "富士"].map((localityName, index) => ({
    ...structuredClone(activity),
    ref: (9900 + index).toString(16).padStart(64, "0"),
    title: localityName,
    sortOrder: index,
    place: { ...activity.place, localityName },
  }));
  fixture.trip.dayCount = fixture.days.length;
  return fixture;
}

export async function verifySharingUx({ page, app, token, directory }) {
  let calculations = 0;
  const routePattern = `${app.baseUrl}/share/**`;
  await page.route(routePattern, async (route) => {
    if (route.request().method() !== "POST" || !route.request().headers()["next-action"])
      return route.fallback();
    calculations++;
    const calculation = { legs: [], totalDistanceMeters: 1200, totalDurationSeconds: 240 };
    // Controlled routing result; real-provider behavior is covered by the regional live suites.
    return route.fulfill({
      contentType: "text/x-component",
      body: `0:${JSON.stringify({ a: { data: calculation }, f: [], b: "development" })}\n`,
    });
  });
  try {
    for (const template of ["standard", "bento", "neon", "traverse", "ethereal", "journal"]) {
      const fixture = fixtureFor(template);
      app.setFixture(fixture);
      for (const [width, height] of [
        [390, 844],
        [430, 932],
        [768, 1024],
        [820, 1180],
        [1024, 768],
        [1199, 768],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width, height });
        await page.goto(`${app.baseUrl}/share/${token}`);
        await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
        await page.locator("#public-overview-panel").waitFor({ state: "visible" });
        const dayCard = page.locator(
          `#public-overview-panel [data-public-day-ref="${fixture.days[3].ref}"]`,
        );
        assert.ok(
          (await dayCard.innerText()).includes("Tokyo → 箱根 → 富士"),
          `${template} Overview includes the preceding hotel locality`,
        );
        if (template === "journal") {
          const dots = await page.locator(".journal-contents-continuation").evaluateAll((nodes) =>
            nodes.map((node) => ({
              count: node.children.length,
              gap: getComputedStyle(node).gap,
            })),
          );
          assert.ok(dots.length > 0);
          assert.ok(dots.every(({ count, gap }) => count === 3 && gap === "5px"));
        }
        await page.getByRole("tab", { name: "Timeline", exact: true }).click();
        const timeline = page.locator("#public-timeline-panel");
        const heading = timeline
          .locator(`[data-public-day-ref="${fixture.days[3].ref}"]`)
          .first()
          .locator(".edition-day-heading, .timeline-section-header-v4")
          .first();
        assert.ok(
          (await heading.innerText()).includes("Tokyo → 箱根 → 富士"),
          `${template} Timeline includes the preceding hotel locality`,
        );
        if (width < 1200) {
          assert.equal(await heading.evaluate((node) => getComputedStyle(node).position), "static");
          await heading.evaluate((node) => node.scrollIntoView({ block: "start" }));
          const before = await heading.boundingBox();
          await timeline.locator(".public-view-scroll").evaluate((node) => {
            node.scrollTop += 120;
          });
          const after = await heading.boundingBox();
          assert.ok(
            after.y < before.y - 90,
            `${template} ${width}: day headers release reading space as content scrolls`,
          );
        }
        const mapTrigger = page.getByRole("button", { name: "Open map and routes", exact: true });
        const mobileMap = await mapTrigger.isVisible();
        if (mobileMap) await mapTrigger.click();
        const workspace = page.locator(".public-map-workspace:visible");
        await workspace.getByRole("button", { name: "Open route panel", exact: true }).click();
        const drawer = workspace.locator(".public-map-panel");
        const body = drawer.locator(".public-map-panel-body");
        const geometry = await drawer.evaluate((node) => {
          const toolbar = node.querySelector(".public-map-panel-toolbar").getBoundingClientRect();
          const body = node.querySelector(".public-map-panel-body");
          return {
            toolbar: toolbar.height,
            panel: node.clientHeight,
            body: body.clientHeight,
            overflow: node.scrollWidth > node.clientWidth,
          };
        });
        assert.ok(
          geometry.toolbar <= 48 && !geometry.overflow,
          JSON.stringify({ template, width, ...geometry }),
        );
        assert.ok(
          geometry.body >= geometry.panel - 70,
          `Fixed controls use at most 70px: ${JSON.stringify({ template, width, ...geometry })}`,
        );
        const action = drawer.locator(".public-map-calculate");
        assert.equal(
          await action.evaluate((node) => Boolean(node.closest(".public-map-panel-body"))),
          true,
        );
        await drawer.getByRole("button", { name: "Day route", exact: true }).click();
        await action.click();
        await drawer.getByRole("button", { name: "Calculate", exact: true }).waitFor();
        const setup = await drawer.evaluate((node) => ({
          panel: node.clientHeight,
          body: node.querySelector(".public-map-panel-body").clientHeight,
        }));
        assert.ok(
          setup.body >= setup.panel * 0.6,
          `Route setup retains reading space: ${JSON.stringify({ template, width, ...setup })}`,
        );
        const actionBefore = await action.boundingBox();
        await body.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        const actionAfter = await action.boundingBox();
        if (await body.evaluate((node) => node.scrollHeight > node.clientHeight + 10))
          assert.ok(
            actionAfter.y < actionBefore.y - 10,
            "Calculation controls scroll away with the stop list",
          );
        await body.evaluate((node) => {
          node.scrollTop = 0;
        });
        await action.click();
        await drawer.getByRole("button", { name: "Edit route", exact: true }).waitFor();
        assert.equal(
          await drawer.getByRole("button", { name: "Edit route", exact: true }).count(),
          1,
          "Calculated routes expose exactly one edit action",
        );
        await action.click();
        await drawer.getByRole("button", { name: "Calculate", exact: true }).waitFor();
        if (directory && width === 390)
          await page.screenshot({ path: `${directory}/${template}-compact-map-panel.png` });
        if (mobileMap)
          await page
            .locator(".public-mobile-map")
            .getByRole("button", { name: "Back", exact: true })
            .click();
      }
      console.log(`PASS ${template} sharing UX at seven viewports`);
    }
    assert.equal(
      calculations,
      42,
      "Every template and viewport completed the calculation/edit flow",
    );
    console.log(
      "PASS all six template day titles, non-sticky touch headers, compact route panels, scrolling controls and unique edit actions at seven viewports",
    );
    await verifyAddDay({ page });
  } finally {
    await page.unroute(routePattern);
  }
}

async function verifyAddDay({ page }) {
  const bundle = await build({
    entryPoints: ["scripts/fixtures/add-day-affordance.tsx"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    define: {
      "process.env": JSON.stringify({ NODE_ENV: "production", NEXT_PUBLIC_APP_REGION: "global" }),
    },
    plugins: [
      {
        name: "local-locale-action",
        setup(builder) {
          builder.onResolve({ filter: /^\.\/actions$/ }, (args) =>
            args.importer.endsWith("i18n-provider.tsx")
              ? { path: "locale-action", namespace: "test" }
              : null,
          );
          builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents: "export async function persistLocale() {}",
          }));
        },
      },
    ],
  });
  for (const width of [390, 430, 768, 820, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.addScriptTag({ type: "module", content: bundle.outputFiles[0].text });
    const fixture = page.locator("[data-test-add-day]");
    try {
      await fixture.waitFor();
      assert.equal(await fixture.locator("[data-add-day]").count(), 1);
      const last = fixture.locator('[data-day-number="3"] [data-add-day]');
      await last.focus();
      await page.keyboard.press("Enter");
      await fixture.locator('[data-day-number="4"] [data-add-day]').waitFor();
      assert.equal(
        await fixture.locator("[data-add-day]").count(),
        1,
        "New last day retains the permanent action",
      );
      assert.equal(
        await fixture.locator("[data-test-selected]").textContent(),
        "none",
        "Keyboard activation does not select the enclosing day",
      );
      await fixture.locator('[data-day-number="1"]').click();
      assert.equal(
        await fixture.locator("[data-add-day]").count(),
        2,
        "Selecting another day keeps the last-day affordance visible",
      );
    } finally {
      await page.evaluate(() => window.disposeAddDayFixture());
    }
  }
  console.log(
    "PASS permanent last-day Add day, selected-day insert action and keyboard append at six viewports",
  );
}
