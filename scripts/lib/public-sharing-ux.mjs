import assert from "node:assert/strict";
import { build } from "esbuild";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";
import { touchDrag } from "./public-sharing-mobile-gestures.mjs";

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
  fixture.days.forEach((day, index) => {
    day.items.push({
      ref: (20000 + index).toString(16).padStart(64, "0"),
      sortOrder: 0,
      title: "Reminder for day " + (index + 1),
      notes: "Keep your passport in your bag.",
      type: "note",
    });
  });
  const secondDay = fixture.days[1];
  const previousHotel = fixture.days[0].items.find((item) => item.type === "hotel");
  const hotel = secondDay.items.find((item) => item.type === "hotel");
  const stops = [
    previousHotel,
    ...secondDay.items.filter((item) => ["activity", "meal", "car_rental"].includes(item.type)),
    hotel,
  ].map((item, index) => ({
    displayName: item.place.displayName,
    latitude: item.place.latitude,
    longitude: item.place.longitude,
    position: index + 1,
    ref: item.ref,
    title: item.title,
    type: item.type,
  }));
  fixture.savedRoutes = [
    {
    dayNumber: secondDay.dayNumber,
    dayRef: secondDay.ref,
    legs: stops.slice(1).map((_, index) => ({
      mode: "self_driving",
      position: index + 1,
    })),
    ref: "c".repeat(64),
    status: "saved",
    stops,
    totalDistanceMeters: null,
    totalDurationSeconds: null,
    },
  ];
  fixture.trip.dayCount = fixture.days.length;
  return fixture;
}

export async function verifySharingUx({ page, app, token, directory }) {
  let calculations = 0;
  const calculationInputs = [];
  const routePattern = `${app.baseUrl}/share/**`;
  await page.route(routePattern, async (route) => {
    if (route.request().method() !== "POST" || !route.request().headers()["next-action"])
      return route.fallback();
    calculations++;
    const [input] = JSON.parse(route.request().postData());
    calculationInputs.push(input);
    const calculation = {
      legs: Array.from({ length: 6 }, (_, index) => ({
        position: index + 1,
        mode: input.legModes[index] ?? "self_driving",
        distanceMeters: 200,
        durationSeconds: 40,
        geometry: {
          source: "straight",
          origin: { latitude: 48.85, longitude: 2.35 },
          destination: { latitude: 48.86, longitude: 2.36 },
          coordinateSystem: "wgs84",
        },
      })),
      totalDistanceMeters: 1200,
      totalDurationSeconds: 240,
    };
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
        const overviewNote = dayCard.locator("[data-public-note-ref]");
        assert.equal(await overviewNote.count(), 1, "Overview has one independent note.");
        assert.ok((await overviewNote.textContent()).includes("Keep your passport"));
        assert.equal(
          await dayCard
            .locator(".edition-overview-stops, .public-overview-board")
            .getByText("Reminder for day 4", { exact: true })
            .count(),
          0,
          "Notes never enter the overview plans.",
        );
        await page.getByRole("tab", { name: "Timeline", exact: true }).click();
        const timeline = page.locator("#public-timeline-panel");
        const noteDay = timeline
          .locator('[data-public-day-ref="' + fixture.days[0].ref + '"]')
          .first();
        assert.equal(await noteDay.locator("[data-public-note-ref]").count(), 1);
        assert.equal(
          await noteDay
            .locator(".edition-plan-list, .timeline-node-list-v4")
            .getByText("Reminder for day 1", { exact: true })
            .count(),
          0,
          "Timeline notes have no activity ordinal.",
        );
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
        await workspace.getByRole("button", { name: "Close route panel", exact: true }).waitFor();
        const drawer = workspace.locator(".public-map-panel");
        const body = drawer.locator(".public-map-panel-body");
        await workspace.locator("[data-mock-google-map=ready]").waitFor();
        await assertPanelBoundaries(workspace, { template, width, phase: "initial" });
        const geometry = await drawer.evaluate((node) => {
          const toolbarNode = node.querySelector(".public-map-panel-toolbar");
          const toolbar = toolbarNode.getBoundingClientRect();
          const style = getComputedStyle(toolbarNode);
          const body = node.querySelector(".public-map-panel-body");
          return {
            toolbar: toolbar.height,
            paddingTop: parseFloat(style.paddingTop),
            paddingBottom: parseFloat(style.paddingBottom),
            panel: node.clientHeight,
            body: body.clientHeight,
            overflow: node.scrollWidth > node.clientWidth,
          };
        });
        assert.ok(
          geometry.toolbar - geometry.paddingTop - geometry.paddingBottom <= 48 &&
            !geometry.overflow,
          JSON.stringify({ template, width, ...geometry }),
        );
        assert.ok(
          geometry.paddingTop === 3 && geometry.paddingBottom === 0,
          "Route toolbar has a small top inset.",
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
        await assertPanelBoundaries(workspace, { template, width, phase: "day" });
        await selectRouteDay(page, drawer, 1);
        await drawer.getByRole("button", { name: "Calculate route", exact: true }).waitFor();
        assert.ok((await drawer.locator("[data-public-route-stop]").count()) >= 2);
        const checkedStops = await drawer
          .getByRole("checkbox")
          .evaluateAll(
            (nodes) => nodes.filter((node) => node.getAttribute("data-state") === "checked").length,
          );
        assert.ok(checkedStops >= 2, "Mapped stops are ready without entering another setup step.");
        const travel = drawer.getByRole("combobox", { name: /^Travel from/ }).first();
        await travel.click();
        for (const mode of ["Flight", "Ferry", "Cable car", "Other"])
          assert.equal(await page.getByRole("option", { name: mode, exact: true }).count(), 1);
        await page.getByRole("option", { name: "Flight", exact: true }).click();
        const daySelect = await drawer
          .getByRole("combobox", { name: "Route day", exact: true })
          .boundingBox();
        const calculateBounds = await action.boundingBox();
        assert.ok(
          daySelect.y + daySelect.height <= calculateBounds.y + 1,
          "Day selection precedes route calculation.",
        );
        const setup = await drawer.evaluate((node) => ({
          panel: node.clientHeight,
          body: node.querySelector(".public-map-panel-body").clientHeight,
        }));
        assert.ok(
          setup.body >= setup.panel * 0.6,
          `Route setup retains reading space: ${JSON.stringify({ template, width, ...setup })}`,
        );
        const actionBefore = await action.boundingBox();
        const toolbarBefore = await drawer.locator(".public-map-panel-toolbar").boundingBox();
        await body.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        const actionAfter = await action.boundingBox();
        assert.ok(
          Math.abs(
            (await drawer.locator(".public-map-panel-toolbar").boundingBox()).y - toolbarBefore.y,
          ) <= 1,
        );
        if (await body.evaluate((node) => node.scrollHeight > node.clientHeight + 10))
          assert.ok(
            actionAfter.y < actionBefore.y - 10,
            "Calculation controls scroll away with the stop list",
          );
        await body.evaluate((node) => {
          node.scrollTop = 0;
        });
        await action.click();
        await workspace.getByRole("button", { name: "Open route panel", exact: true }).waitFor();
        assert.equal(await body.count(), 0, "Successful day calculation collapses the panel.");
        await assertPanelBoundaries(workspace, {
          template,
          width,
          phase: "day-calculated-collapsed",
        });
        await workspace.getByRole("button", { name: "Open route panel", exact: true }).click();
        await drawer.getByRole("button", { name: "Edit route", exact: true }).waitFor();
        await assertExpandedLegs(drawer, { template, width, scope: "day" });
        assert.equal(
          await drawer.getByRole("button", { name: "Edit route", exact: true }).count(),
          1,
          "Calculated routes expose exactly one edit action",
        );
        const firstDayRequest = calculationInputs.at(-1);
        assert.equal(firstDayRequest.dayRef, fixture.days[0].ref);
        assert.equal(firstDayRequest.legModes[0], "flight");
        await selectRouteDay(page, drawer, 2);
        await drawer.getByRole("button", { name: "Calculate route", exact: true }).waitFor();
        assert.equal(
          await drawer.getByRole("button", { name: "Edit route", exact: true }).count(),
          0,
        );
        assert.ok(await action.isEnabled(), "Saved configuration without a calculation needs no Edit/setup action.");
        const secondTravel = drawer.getByRole("combobox", { name: /^Travel from/ }).first();
        assert.equal((await secondTravel.textContent()).trim(), "Drive");
        await secondTravel.click();
        await page.getByRole("option", { name: "Ferry", exact: true }).click();
        const beforeSecondDay = calculations;
        await action.click();
        await workspace.getByRole("button", { name: "Open route panel", exact: true }).waitFor();
        assert.equal(calculations, beforeSecondDay + 1, "One action calculates the next day.");
        assert.equal(calculationInputs.at(-1).dayRef, fixture.days[1].ref);
        assert.equal(calculationInputs.at(-1).legModes[0], "ferry");
        await workspace.getByRole("button", { name: "Open route panel", exact: true }).click();
        await drawer.getByRole("button", { name: "Edit route", exact: true }).waitFor();
        await selectRouteDay(page, drawer, 1);
        await drawer.getByRole("button", { name: "Edit route", exact: true }).waitFor();
        await assertExpandedLegs(drawer, { template, width, scope: "returned-day" });
        assert.equal(calculations, beforeSecondDay + 1, "Returning reuses the calculated day.");
        await action.click();
        await drawer.getByRole("button", { name: "Calculate route", exact: true }).waitFor();
        assert.equal(
          (
            await drawer
              .getByRole("combobox", { name: /^Travel from/ })
              .first()
              .textContent()
          ).trim(),
          "Flight",
          "Editing restores this day's own travel modes.",
        );
        const checkbox = drawer.getByRole("checkbox").last();
        const excludedRef = await checkbox.getAttribute("id");
        await checkbox.click();
        await selectRouteDay(page, drawer, 2);
        await drawer.getByRole("button", { name: "Edit route", exact: true }).waitFor();
        await selectRouteDay(page, drawer, 1);
        await drawer.getByRole("button", { name: "Calculate route", exact: true }).waitFor();
        assert.equal(
          await drawer.locator('[id="' + excludedRef + '"]').getAttribute("data-state"),
          "unchecked",
        );
        assert.equal(
          (
            await drawer
              .getByRole("combobox", { name: /^Travel from/ })
              .first()
              .textContent()
          ).trim(),
          "Flight",
          "Uncalculated edits survive day switching as well.",
        );
        if (width <= 430) {
          const rect = await body.boundingBox();
          const top = (await drawer.boundingBox()).y;
          await touchDrag(
            page,
            { x: rect.x + 30, y: rect.y + 35 },
            { x: rect.x + 30, y: Math.min(height - 10, rect.y + 210) },
          );
          assert.ok(await body.isVisible(), "Swiping down through route content never closes it");
          assert.ok(
            Math.abs((await drawer.boundingBox()).y - top) <= 1,
            "Route content does not drag the panel",
          );
          assert.equal(await drawer.getAttribute("data-pull-up-dragging"), null);
        }
        await drawer.getByRole("button", { name: "Whole trip", exact: true }).click();
        await body.evaluate((node) => {
          node.scrollTop = 0;
        });
        await drawer.getByRole("button", { name: "Calculate whole trip", exact: true }).click();
        await workspace.getByRole("button", { name: "Open route panel", exact: true }).waitFor();
        assert.equal(
          await body.count(),
          0,
          "Successful whole-trip calculation collapses the panel.",
        );
        await workspace.getByRole("button", { name: "Open route panel", exact: true }).click();
        await drawer.getByRole("button", { name: "Edit route", exact: true }).waitFor();
        await assertExpandedLegs(drawer, { template, width, scope: "overview" });
        await assertPanelBoundaries(workspace, { template, width, phase: "calculated" });
        await drawer.getByRole("button", { name: "Close route panel", exact: true }).click();
        await assertPanelBoundaries(workspace, { template, width, phase: "closed" });
        await workspace.getByRole("button", { name: "Open route panel", exact: true }).click();
        await assertPanelBoundaries(workspace, { template, width, phase: "reopened" });
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
      126,
      "Every template and viewport calculated two days and the whole trip",
    );
    console.log(
      "PASS all six template day titles, non-sticky touch headers, compact route panels, scrolling controls and unique edit actions at seven viewports",
    );
    await verifyAddDay({ page });
  } finally {
    await page.unroute(routePattern);
  }
}

async function selectRouteDay(page, drawer, dayNumber) {
  const select = drawer.getByRole("combobox", { name: "Route day", exact: true });
  await select.click();
  await page.getByRole("option", { name: new RegExp("^Day " + dayNumber + " ·") }).click();
}

async function assertPanelBoundaries(workspace, context) {
  const geometry = await workspace.evaluate((node) => {
    const canvas = node.querySelector(".public-map-canvas").getBoundingClientRect();
    const sdk = node.querySelector("[data-mock-google-map=ready]").getBoundingClientRect();
    const panel = node.querySelector(".public-map-panel").getBoundingClientRect();
    return {
      gap: panel.top - canvas.bottom,
      grayStrip: panel.top - sdk.bottom,
      bottom: node.getBoundingClientRect().bottom - panel.bottom,
    };
  });
  assert.ok(
    Object.values(geometry).every((gap) => Math.abs(gap) <= 1),
    `Map and panel meet without empty strips: ${JSON.stringify({ ...context, ...geometry })}`,
  );
}

async function assertExpandedLegs(drawer, context) {
  const legs = drawer.getByRole("list", { name: "Route leg details", exact: true });
  await legs.waitFor();
  assert.equal(await legs.locator("li").count(), 6, JSON.stringify(context));
  const layout = await drawer.evaluate((node) => ({
    collapseControls: [...node.querySelectorAll("button[aria-expanded]")].filter(
      (button) =>
        !button.classList.contains("public-map-panel-toggle") &&
        button.getAttribute("role") !== "combobox",
    ).length,
    nestedScrollers: [...node.querySelector(".public-map-panel-body").querySelectorAll("*")].filter(
      (child) => /auto|scroll/.test(getComputedStyle(child).overflowY),
    ).length,
  }));
  assert.deepEqual(layout, { collapseControls: 0, nestedScrollers: 0 }, JSON.stringify(context));
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
