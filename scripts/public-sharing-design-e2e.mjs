import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  startPublicSharingDesignRuntime,
  designSessionCookie,
} from "./lib/public-sharing-design-runtime.mjs";
import assert from "node:assert/strict";
import { installGoogleMapsMock } from "./lib/public-sharing-google-sdk.mjs";
import { bufferDevelopmentScripts } from "./lib/public-sharing-static-responses.mjs";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { parisPublicItinerary } from "../src/features/landing/landing-public-fixture.ts";
import { verifyFullScreenMap } from "./lib/public-sharing-fullscreen-map.mjs";
import { verifyPhotoAnchoringAndFields } from "./lib/public-sharing-photo-anchoring.mjs";
import { verifyPanelPolish } from "./lib/public-sharing-panel-polish.mjs";
import { verifyEditorialPolish } from "./lib/public-sharing-editorial-polish.mjs";
import { verifyUndatedSharing } from "./lib/public-sharing-undated.mjs";
import {
  touchDrag,
  verifyContinuousReaderAndSheet,
} from "./lib/public-sharing-mobile-gestures.mjs";
const stage = process.env.PUBLIC_SHARING_DESIGN_STAGE ?? "all";
assert.ok(
  [
    "all",
    "responsive",
    "chapters",
    "longtrip",
    "gestures",
    "classic",
    "trips",
    "touch",
    "polish",
    "refinement",
    "presentation",
    "maps",
    "refinement2",
    "reader",
    "backgrounds",
    "undated",
  ].includes(stage),
  "Unknown sharing design stage.",
);
const runs = (name) =>
  stage === "all" ||
  stage === name ||
  (stage === "refinement2" && ["maps", "refinement", "polish", "longtrip"].includes(name)) ||
  (stage === "backgrounds" &&
    ["maps", "refinement", "polish", "longtrip", "trips"].includes(name)) ||
  (stage === "reader" && ["maps", "refinement", "longtrip"].includes(name)) ||
  (stage === "presentation" && ["longtrip", "gestures"].includes(name));
const token = "11111111-1111-4111-8111-111111111111";
const directory = process.env.PUBLIC_SHARING_DESIGN_ARTIFACT_DIR;
if (directory) await mkdir(directory, { recursive: true });
const app = await startPublicSharingDesignRuntime({ enableMockMap: true });
const executablePath = [
  process.env.CHROME_PATH,
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].find((path) => path && existsSync(path));
assert.ok(executablePath, "Chromium is required.");
const errors = [];
let scriptResponses;
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
try {
  if (stage === "all" || stage === "backgrounds") {
    const auth = await promisify(execFile)(
      process.execPath,
      ["scripts/check-auth-routes.mjs", app.baseUrl],
      { env: { ...process.env, APP_REGION: "global" }, timeout: 150_000 },
    );
    console.log(auth.stdout.trim());
  }
  const page = await browser.newPage({ hasTouch: true });
  scriptResponses = await bufferDevelopmentScripts(page);
  await page.addInitScript(installGoogleMapsMock);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(() => {
    window.sharingScriptErrors = [];
    window.addEventListener("error", (event) => {
      window.sharingScriptErrors.push({
        message: event.message,
        file: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    });
  });
  page.on("pageerror", (e) => errors.push({ message: e.message, stack: e.stack, url: page.url() }));
  const requests = { resolve: 0, media: 0, external: 0 };
  const resolvedRefs = [];
  const tripPhotoRequests = { resolve: 0, media: 0 };
  page.on("request", (r) => {
    if (/googleapis|generativelanguage|openai.com|anthropic/.test(r.url())) requests.external++;
  });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#b4c9c0"/><path d="M0 410L240 250 470 420 620 220 800 390V600H0" fill="#527368"/><circle cx="650" cy="140" r="60" fill="#eee5d4"/><text x="30" y="560" font-family="sans-serif" font-size="22" fill="white">Controlled place photo · test only</text></svg>';
  let publicPhotoDelay = 0;
  let photoBarrier;
  let heldPhotos = 0;
  const photoGate = {
    hold() {
      heldPhotos = 0;
      let release;
      const promise = new Promise((resolve) => {
        release = resolve;
      });
      photoBarrier = { promise, release };
    },
    release() {
      photoBarrier?.release();
      photoBarrier = undefined;
    },
    held() {
      return heldPhotos;
    },
  };
  let tripPhotoSvg = svg;
  let tripPhotoAuthors = [{ label: "Test author", url: "https://example.invalid/author" }];
  await page.route("**/api/public-place-photo/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("resolve")) {
      requests.resolve++;
      const itemRef = url.pathname.split("/").at(-1);
      resolvedRefs.push(itemRef);
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
      // A portrait fallback forces genuine height growth even in a wide two-column chapter.
      // Keep both mock rendition dimensions within the existing 800px provider limit.
      const mediaSvg = photoBarrier
        ? svg.replace('width="800" height="600"', 'width="400" height="800"')
        : svg;
      if (photoBarrier) {
        const barrier = photoBarrier;
        heldPhotos++;
        await barrier.promise;
      }
      if (publicPhotoDelay) await new Promise((resolve) => setTimeout(resolve, publicPhotoDelay));
      await route.fulfill({ contentType: "image/svg+xml", body: mediaSvg });
    }
  });
  await page.route("**/api/trips/*/cover-photo**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("resolve") === "1") {
      tripPhotoRequests.resolve++;
      return route.fulfill({
        json: {
          id: "google-place:saved-city-Paris",
          kind: "image",
          source: "google_place",
          url: `${url.pathname}?photo=places/saved-city-Paris/photos/mock&signature=${"a".repeat(64)}`,
          attributions: tripPhotoAuthors,
          sourceUrl: "https://www.google.com/maps/search/?api=1&query=Paris",
        },
      });
    }
    tripPhotoRequests.media++;
    return route.fulfill({ contentType: "image/svg+xml", body: tripPhotoSvg });
  });
  const report = [];
  if (runs("undated")) await verifyUndatedSharing({ page, app, token, directory });
  if (runs("polish"))
    await verifyEditorialPolish({
      page,
      app,
      token,
      directory,
      photoDelay: (value) => {
        publicPhotoDelay = value;
      },
    });
  if (runs("polish")) await verifyPanelPolish({ page, directory });
  if (runs("responsive")) {
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
        if (photos)
          fixture.cityPhotoSources = fixture.days.map((day) => ({
            dayRef: day.ref,
            ref: String(day.dayNumber).repeat(64),
            name: day.city,
            googlePlaceId: `saved-city-${day.city}`,
          }));
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
          await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
          await page.locator(".itinerary-edition").first().waitFor();
          await page.evaluate(() => document.fonts.ready);
          if (photos) {
            await page.locator("#public-overview-panel .edition-photo").first().waitFor();
          }
          for (const view of ["overview", "timeline"]) {
            await page.getByRole("tab", { name: view, exact: false }).click();
            const selector = `#public-${view}-panel`;
            await page.locator(selector).waitFor({ state: "visible" });
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
            const renderedDays = fixture.days;
            assert.deepEqual(
              new Set(data.refs),
              new Set(
                renderedDays
                  .flatMap((d) => d.items)
                  .filter(
                    (item) =>
                      view === "timeline" ||
                      !["transport", "flight", "train", "car_rental"].includes(item.type),
                  )
                  .map((i) => i.ref),
              ),
            );
            assert.equal(data.refs.length, new Set(data.refs).size);
            if (photos && template === "ethereal" && view === "timeline" && width >= 768) {
              const cover = page.locator(selector + " .edition-front");
              await cover.locator(".edition-photo").waitFor();
              const geometry = await cover.evaluate((node) => ({
                titleBottom: node.querySelector(".edition-cover-copy").getBoundingClientRect()
                  .bottom,
                photoTop: node.querySelector(".edition-photo").getBoundingClientRect().top,
              }));
              assert.ok(
                geometry.photoTop >= geometry.titleBottom,
                "Cover photo follows title copy.",
              );
            }
            if (width <= 430) {
              const headerHeight = await page
                .locator(".public-itinerary-header")
                .evaluate((node) => node.getBoundingClientRect().height);
              assert.ok(headerHeight <= 64, `Mobile header stays compact: ${headerHeight}px`);
            }
            if (view === "timeline") {
              assert.equal(
                await page.locator(selector + " .edition-day").count(),
                fixture.days.length,
                "Every chapter remains mounted for continuous reading.",
              );
              if (photos && template === "journal") {
                // Establish all intrinsic photo sizes before measuring scroll geometry.
                // The polish stage separately tests explicit jumps while pixels arrive late.
                for (const day of fixture.days) {
                  const chapter = page.locator(
                    selector + ` .edition-day[data-public-day-ref="${day.ref}"]`,
                  );
                  await page.locator(selector + " .public-view-scroll").evaluate((node, ref) => {
                    const chapter = node.querySelector(`[data-public-day-ref="${ref}"]`);
                    node.scrollTop +=
                      chapter.getBoundingClientRect().top - node.getBoundingClientRect().top;
                  }, day.ref);
                  await chapter.locator(".edition-photo img").waitFor();
                }
              }
              for (const day of fixture.days) {
                const clamped = await page
                  .locator(selector + " .public-view-scroll")
                  .evaluate((node, ref) => {
                    node.dispatchEvent(new WheelEvent("wheel"));
                    const chapter = node.querySelector(`[data-public-day-ref="${ref}"]`);
                    const desired =
                      node.scrollTop +
                      chapter.getBoundingClientRect().top -
                      node.getBoundingClientRect().top;
                    node.scrollTop = desired;
                    return desired > node.scrollHeight - node.clientHeight + 1;
                  }, day.ref);
                // Short final chapters cannot all reach the top without artificial blank space.
                // Verify the explicit date jump without adding an empty viewport to the reader.
                if (clamped) {
                  await page
                    .locator(selector + " .edition-dates button")
                    .nth(fixture.days.indexOf(day))
                    .click();
                }
                await page
                  .waitForFunction(
                    (ref) =>
                      document
                        .querySelector("#public-timeline-panel .edition-dates [aria-current=date]")
                        ?.closest("button")
                        ?.textContent.includes(`Day ${ref}`),
                    day.dayNumber,
                    { timeout: 5000 },
                  )
                  .catch(async (error) => {
                    throw new Error(
                      `Scroll sync failed ${JSON.stringify({ template, photos, width, day: day.dayNumber, nav: await page.locator(selector + " .edition-dates").textContent(), geometry: await page.locator(selector + " .public-view-scroll").evaluate((n) => ({ scroll: n.scrollTop, height: n.clientHeight, full: n.scrollHeight, chapters: [...n.querySelectorAll(".edition-day")].map((d) => ({ ref: d.dataset.publicDayRef, top: d.getBoundingClientRect().top - n.getBoundingClientRect().top })) })) })}`,
                      { cause: error },
                    );
                  });
              }
              await page
                .locator(selector + " .edition-dates button")
                .first()
                .click();
            }

            if (template === "journal" && view === "timeline") {
              const flow = await page.locator(selector).evaluate((panel) => {
                const heading = panel.querySelector(".edition-day-heading");
                const bands = [...panel.querySelectorAll(".edition-transport")];
                return {
                  headingPosition: getComputedStyle(heading).position,
                  count: bands.length,
                  outsideHeading: bands.every((band) => !band.closest(".edition-day-heading")),
                  positions: bands.map((band) => getComputedStyle(band).position),
                };
              });
              assert.equal(flow.headingPosition, "sticky");
              assert.ok(flow.count > 0);
              assert.equal(flow.outsideHeading, true);
              assert.ok(flow.positions.every((position) => position === "static"));
            }
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
            report.push({
              template,
              photos,
              view,
              width,
              height,
              frame: "pass",
              itemOrder: "pass",
            });
          }
          const before = { ...requests };
          await page.getByRole("tab", { name: "Table", exact: true }).click();
          await page.locator("#public-table-panel").waitFor({ state: "visible" });
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
            assert.ok(
              Math.abs(frame.bottom - frame.nav) <= 1,
              `Short Matrix reaches navigation: ${JSON.stringify({ template, photos, width, height, frame })}`,
            );
            assert.ok(Math.abs(frame.frozen[0].left - frame.frozen[1].left) <= 1);
            assert.ok(Math.abs(frame.frozen[0].width - frame.frozen[1].width) <= 1);
          }
          await page.getByRole("tab", { name: "Overview", exact: true }).click();
          await page.locator("#public-overview-panel").waitFor({ state: "visible" });
          assert.equal(requests.resolve, before.resolve);
          assert.equal(requests.media, before.media);
          assert.equal(
            await page.locator("#public-overview-panel .edition-overview-transport").count(),
            0,
            "Journey transport is removed.",
          );
          assert.equal(
            await page.locator("#public-overview-panel .edition-plan-list").count(),
            0,
            "Overview presents compact chapters rather than the timeline's item list.",
          );
          assert.equal(
            await page.locator("#public-overview-panel .edition-overview-day-card").count(),
            fixture.days.length,
          );
          const columns = await page
            .locator("#public-overview-panel .edition-overview-cards")
            .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
          assert.equal(columns, width <= 700 ? 1 : template === "journal" ? 2 : 3);
        }
        console.log(
          `PASS ${template} ${photos ? "photos" : "no photos"} responsive overview/timeline and media reuse`,
        );
      }
  }
  if (runs("chapters")) {
    // Sticky chapter numbers remain contained, including two-digit Chinese chapters.
    for (const template of ["journal", "ethereal"]) {
      const fixture = structuredClone(parisPublicItinerary);
      fixture.settings.templateId = template;
      fixture.settings.showPlacePhotos = false;
      fixture.settings.showMapRoutes = false;
      fixture.days = fixture.days.slice(0, 2).map((day, index) => ({
        ...day,
        dayNumber: 9 + index,
        title: index ? "广州市 · 返程与城市漫步" : "基督城 · 南岛旅程开始",
      }));
      app.setFixture(fixture);
      for (const width of [390, 430, 820, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${app.baseUrl}/share/${token}`);
        await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
        await page.locator(".itinerary-edition").first().waitFor();
        await page.locator("#public-overview-panel .edition-overview-open").nth(1).click();
        await page.locator("#public-timeline-panel").waitFor({ state: "visible" });
        await page.waitForFunction(
          (ref) => document.activeElement?.getAttribute("data-public-day-ref") === ref,
          fixture.days[1].ref,
        );
        const day = page.locator(
          `#public-timeline-panel .edition-day[data-public-day-ref="${fixture.days[1].ref}"]`,
        );
        const bounds = await day.evaluate((node) => {
          const heading = node.querySelector(".edition-day-heading").getBoundingClientRect();
          const number = node.querySelector(".edition-day-number").getBoundingClientRect();
          const scroller = node.closest(".public-view-scroll").getBoundingClientRect();
          const markers = [...node.querySelectorAll(".edition-plan-order")].map((marker) => ({
            width: marker.getBoundingClientRect().width,
            height: marker.getBoundingClientRect().height,
            radius: getComputedStyle(marker).borderRadius,
          }));
          return {
            heading: heading.toJSON(),
            number: number.toJSON(),
            scroller: scroller.toJSON(),
            markers,
          };
        });
        if (template === "journal") {
          assert.equal(bounds.number.width, 48);
          assert.equal(bounds.number.height, 48);
          assert.ok(
            bounds.number.top >= bounds.heading.top &&
              bounds.number.bottom <= bounds.heading.bottom,
          );
          assert.ok(
            bounds.number.top >= bounds.scroller.top &&
              bounds.number.bottom <= bounds.scroller.bottom,
          );
        } else {
          assert.ok(bounds.markers.length > 0);
          assert.ok(
            bounds.markers.every(
              (marker) => marker.width === 37 && marker.height === 37 && marker.radius === "50%",
            ),
          );
        }
      }
    }
  }
  if (runs("chapters") || runs("longtrip")) {
    // A long Journal keeps the photo hero independent of the number of chapters.
    const longJournal = structuredClone(parisPublicItinerary);
    longJournal.settings.templateId = "journal";
    longJournal.settings.showPlacePhotos = true;
    longJournal.settings.showMapRoutes = false;
    longJournal.days = Array.from({ length: 12 }, (_, index) => ({
      ...structuredClone(longJournal.days[0]),
      ref: (100 + index).toString(16).padStart(64, "0"),
      dayNumber: index + 1,
      title: `Chapter ${index + 1}`,
      items: longJournal.days[0].items.map((item, itemIndex) => ({
        ...structuredClone(item),
        ref: (1000 + index * 10 + itemIndex).toString(16).padStart(64, "0"),
      })),
    }));
    longJournal.trip.dayCount = 12;
    // The teaser should reveal rich chapters from the middle, with omissions on both ends.
    for (const index of [1, 4, 9]) {
      const day = longJournal.days[index];
      const activity = day.items.find((item) => item.type === "activity");
      day.items.push(
        ...Array.from({ length: 3 }, (_, extra) => ({
          ...structuredClone(activity),
          ref: (9000 + index * 10 + extra).toString(16).padStart(64, "0"),
          sortOrder: 20 + extra,
        })),
      );
    }
    longJournal.cityPhotoSources = longJournal.days.map((day) => ({
      dayRef: day.ref,
      ref: "9".repeat(64),
      name: "Paris",
      googlePlaceId: "saved-city-Paris",
    }));
    app.setFixture(longJournal);
    for (const width of [390, 430, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${app.baseUrl}/share/${token}`);
      await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
      const front = page.locator("#public-overview-panel .edition-front");
      await front.locator(".edition-photo img").waitFor();
      assert.equal(
        await front.locator(".edition-navigation").count(),
        0,
        "No full day list runs beside the cover photo.",
      );
      assert.equal(
        await front.locator(".journal-quick-overview button").count(),
        3,
        "The contents card previews three chapters; the full itinerary stays below.",
      );
      assert.deepEqual(await front.locator(".journal-contents-number").allTextContents(), [
        "02",
        "05",
        "10",
      ]);
      assert.equal(
        await front.locator(".journal-contents-continuation").count(),
        4,
        "Omissions before, between and after the teaser remain visible.",
      );
      assert.equal(
        await page.locator("#public-overview-panel .edition-overview-day-card").count(),
        12,
      );
      const layout = await front.evaluate((node) => ({
        bottom: node.getBoundingClientRect().bottom,
        photoHeight: node.querySelector(".edition-photo img").getBoundingClientRect().height,
        photoCardHeight: node.querySelector(".edition-photo").getBoundingClientRect().height,
        previewHeight: node.querySelector(".journal-quick-overview").getBoundingClientRect().height,
        stampInside: node
          .querySelector(".journal-quick-overview")
          .contains(node.querySelector(".edition-journal-stamp")),
        connectors: [...node.querySelectorAll(".journal-contents-continuation")].map(
          (connector) => ({
            width: connector.firstElementChild.getBoundingClientRect().width,
            height:
              connector.lastElementChild.getBoundingClientRect().bottom -
              connector.firstElementChild.getBoundingClientRect().top,
            dots: connector.children.length,
          }),
        ),
        photoBottom: node.querySelector(".edition-photo").getBoundingClientRect().bottom,
        stampTop: node.querySelector(".edition-journal-stamp").getBoundingClientRect().top,
        stampLeft: node.querySelector(".edition-journal-stamp").getBoundingClientRect().left,
        photoRight: node.querySelector(".edition-photo").getBoundingClientRect().right,
        listTop: node.parentElement.querySelector(".edition-overview-cards").getBoundingClientRect()
          .top,
        width: node.scrollWidth,
        availableWidth: node.clientWidth,
      }));
      assert.ok(layout.photoHeight > 100);
      assert.equal(layout.stampInside, false, "The stamp sits outside the chapter card.");
      assert.ok(
        layout.connectors.every(
          ({ width, height, dots }) => dots === 6 && height > width && height >= 24 && height <= 40,
        ),
        "Visible, short vertical chapter connectors.",
      );
      if (width >= 1024)
        assert.ok(
          Math.abs(layout.photoCardHeight - layout.previewHeight) <= 130,
          `Balanced Journal photo and preview heights: ${JSON.stringify(layout)}`,
        );
      assert.ok(
        layout.stampTop > layout.photoBottom || layout.stampLeft >= layout.photoRight,
        "The page stamp never covers provider pixels or attribution.",
      );
      assert.ok(
        layout.listTop >= layout.bottom,
        "All chapters begin below the complete photo hero.",
      );
      assert.ok(
        layout.width <= layout.availableWidth,
        `The Journal hero fits its reading width: ${JSON.stringify({ width, layout })}`,
      );
      if (directory)
        await page.screenshot({ path: `${directory}/journal-overview-${width}-12-days.png` });
      await page.locator("#public-overview-panel .edition-overview-open").nth(9).click();
      await page
        .waitForFunction(
          () =>
            document
              .querySelector("#public-timeline-panel .edition-dates [aria-current=date]")
              ?.textContent.includes("Day 10"),
          null,
          { timeout: 5000 },
        )
        .catch(async (error) => {
          throw new Error(
            `Day 10 jump failed: ${JSON.stringify(
              await page.locator("#public-timeline-panel").evaluate((panel) => {
                const scroller = panel.querySelector(".public-view-scroll");
                return {
                  current: panel.querySelector(".edition-dates [aria-current=date]")?.textContent,
                  scroll: scroller.scrollTop,
                  height: scroller.clientHeight,
                  full: scroller.scrollHeight,
                  focused: document.activeElement?.getAttribute("data-public-day-ref"),
                  days: [...panel.querySelectorAll(".edition-day")].map((d) => ({
                    number: d.querySelector(".edition-day-number")?.textContent,
                    top: d.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
                  })),
                };
              }),
            )}`,
            { cause: error },
          );
        });
      const dateStrip = await page
        .locator("#public-timeline-panel .edition-dates [aria-current=date]")
        .evaluate((button) => ({
          button: button.getBoundingClientRect().toJSON(),
          strip: button.closest("ol").getBoundingClientRect().toJSON(),
        }));
      assert.ok(
        dateStrip.button.left >= dateStrip.strip.left - 1 &&
          dateStrip.button.right <= dateStrip.strip.right + 1,
        "The date strip keeps the current day visible on long trips.",
      );
      if (directory)
        await page.screenshot({ path: `${directory}/journal-timeline-${width}-day-10.png` });
      for (const index of [4, 10, 1, 9]) {
        await page.locator("#public-timeline-panel .public-view-scroll").evaluate((node, ref) => {
          const chapter = node.querySelector(`[data-public-day-ref="${ref}"]`);
          node.scrollTop += chapter.getBoundingClientRect().top - node.getBoundingClientRect().top;
        }, longJournal.days[index].ref);
        await page.waitForFunction(
          (number) =>
            document
              .querySelector("#public-timeline-panel .edition-dates [aria-current=date]")
              ?.textContent.includes(`Day ${number}`),
          index + 1,
        );
        const position = await page
          .locator("#public-timeline-panel .edition-dates [aria-current=date]")
          .evaluate((button) => ({
            button: button.getBoundingClientRect().toJSON(),
            strip: button.closest("ol").getBoundingClientRect().toJSON(),
          }));
        assert.ok(
          position.button.left >= position.strip.left - 1 &&
            position.button.right <= position.strip.right + 1,
          `Current day remains visible when reading forward or backward: ${JSON.stringify({ width, day: index + 1, position })}`,
        );
      }
    }
  }
  if (runs("chapters")) {
    // A saved scenic anchor supplies the first chapter and hero; later POIs keep their own sources.
    const cityFixture = structuredClone(parisPublicItinerary);
    cityFixture.settings.templateId = "journal";
    cityFixture.settings.showPlacePhotos = true;
    cityFixture.settings.showMapRoutes = false;
    cityFixture.days.forEach((day) =>
      day.items.forEach((item) => {
        if (item.type === "activity" && item.place)
          item.place.googlePlaceId = `saved-poi-${day.dayNumber}`;
      }),
    );
    cityFixture.cityPhotoSources = cityFixture.days.map((day) => ({
      dayRef: day.ref,
      ref: String(day.dayNumber).repeat(64),
      name: day.city,
      googlePlaceId: `saved-city-${day.city}`,
    }));
    app.setFixture(cityFixture);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const cityRequestStart = resolvedRefs.length;
    await page.goto(`${app.baseUrl}/share/${token}`);
    await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
    await page.locator("#public-overview-panel .edition-photo img").first().waitFor();
    assert.ok(!resolvedRefs.slice(cityRequestStart).includes("1".repeat(64)));
    assert.ok(
      resolvedRefs
        .slice(cityRequestStart)
        .includes(cityFixture.days[0].items.find((item) => item.type === "activity").ref),
    );
    await page.locator("#public-overview-panel .edition-overview-open").nth(1).click();
    await page
      .locator(
        `#public-timeline-panel .edition-day[data-public-day-ref="${cityFixture.days[1].ref}"]`,
      )
      .locator(".edition-photo img")
      .waitFor();
    assert.ok(
      resolvedRefs
        .slice(cityRequestStart)
        .includes(cityFixture.days[1].items.find((item) => item.type === "activity").ref),
    );
    assert.ok(!resolvedRefs.slice(cityRequestStart).includes("2".repeat(64)));
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    // Explicit chapter selection enters the same-page timeline and reaches the day.
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await page.locator("#public-overview-panel .edition-overview-open").nth(2).click();
    assert.equal(
      await page.getByRole("tab", { name: "Timeline", exact: true }).getAttribute("aria-selected"),
      "true",
    );
    const selectedChapter = page.locator(
      `#public-timeline-panel .edition-day[data-public-day-ref="${cityFixture.days[2].ref}"]`,
    );
    await selectedChapter.waitFor();
    await selectedChapter.locator(".edition-plan-button").last().click();
    await page.locator("[role=dialog]").waitFor();
    await page.keyboard.press("Escape");
    await page.locator("[role=dialog]").waitFor({ state: "hidden" });
    // Share dialog must overlay table frozen layers.
    await page.getByRole("tab", { name: "Table", exact: true }).click();
    await page.getByRole("button", { name: "Share itinerary", exact: true }).click();
    await page.locator("[role=dialog]").waitFor();
    assert.ok(await page.locator("[role=dialog]").isVisible());
    await page.keyboard.press("Escape");
  }
  if (runs("refinement"))
    await verifyPhotoAnchoringAndFields({ page, app, token, photoGate, directory });
  if (runs("gestures") || runs("maps"))
    await verifyFullScreenMap({ page, app, token, directory, requests });
  if (runs("gestures")) {
    // No-source states omit photos; Journal keeps a stable paper frame on provider failure.
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
          await page.route("**/api/public-place-photo/**", (route) =>
            route.fulfill({ status: 429 }),
          );
        }
        app.setFixture(fixture);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${app.baseUrl}/share/${token}`);
        await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
        await page.locator(".itinerary-edition").first().waitFor();
        await page
          .locator("#public-overview-panel .edition-overview-day-card")
          .scrollIntoViewIfNeeded();
        assert.equal(await page.locator("#public-overview-panel .edition-plan-list").count(), 0);
        await page.getByRole("tab", { name: "Timeline", exact: true }).click();
        await page.waitForFunction(
          () =>
            document.querySelector("#public-timeline-tab")?.getAttribute("aria-selected") ===
            "true",
        );
        if (scenario === "blank" || scenario === "failed-photo")
          assert.equal(await page.locator("#public-timeline-panel .edition-note").count(), 0);
        if (scenario === "blank")
          assert.equal(await page.locator("#public-timeline-panel .edition-plan").count(), 0);
        if (templateId === "journal")
          assert.equal(
            await page
              .locator("#public-timeline-panel .journal-day-spread")
              .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length),
            1,
          );
        if (templateId === "journal" && scenario === "failed-photo") {
          const fallback = page
            .locator('#public-timeline-panel .edition-photo-slot[data-photo-state="unavailable"]')
            .first();
          await fallback.waitFor();
          assert.ok((await fallback.boundingBox()).height > 100);
          assert.equal(await fallback.locator("img").count(), 0);
          assert.ok(await fallback.locator(".edition-photo-placeholder").isVisible());
          assert.equal(
            await fallback
              .locator(".edition-photo-loading-dots i")
              .first()
              .evaluate((node) => getComputedStyle(node).animationName),
            "none",
          );
        } else if (scenario !== "failed-photo") {
          assert.equal(
            await page.locator(".edition-photo-reserved").count(),
            0,
            "Disabled or unavailable photo sources reserve no empty frames.",
          );
        }
        if (scenario === "long-text") {
          await page.locator("#public-timeline-panel .edition-note summary").click();
          assert.equal(
            await page.locator("#public-timeline-panel .edition-note p").textContent(),
            fixture.days[0].notes,
          );
        }
        await page.getByRole("button", { name: "Open map and routes", exact: true }).click();
        const panel = page.locator(".public-mobile-map");
        await panel.waitFor();
        await panel.evaluate((node) =>
          Promise.all(
            node.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
          ),
        );
        const full = await panel.boundingBox();
        assert.ok(
          Math.abs(full.y) <= 1 && Math.abs(full.height - 844) <= 1,
          "The map fills the viewport.",
        );
        assert.equal(await panel.locator(":scope > [data-pull-up-handle]").count(), 0);
        // Downward map pan stays outside the drawer's drag surface.
        const canvas = await panel.locator(".public-map-canvas").boundingBox();
        await touchDrag(
          page,
          { x: canvas.x + 40, y: canvas.y + 100 },
          { x: canvas.x + 40, y: canvas.y + 300 },
        );
        assert.ok(await panel.isVisible(), "Panning the map never dismisses it.");
        assert.equal(await panel.getAttribute("data-pull-up-dragging"), null);
        await panel.getByRole("button", { name: "Open route panel", exact: true }).click();
        const drawer = panel.locator(".public-map-panel");
        const handle = drawer.locator("[data-pull-up-handle]");
        const box = await handle.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 10);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + 90, { steps: 6 });
        assert.ok(
          await drawer.evaluate(
            (node) => new DOMMatrix(getComputedStyle(node).transform).m42 >= 70,
          ),
          "Only the route drawer follows the pointer.",
        );
        await page.mouse.move(box.x + box.width / 2, box.y + 310, { steps: 10 });
        await page.mouse.up();
        await handle.waitFor({ state: "hidden" });
        assert.ok(await panel.isVisible(), "Closing routes keeps the map open.");
        await panel.getByRole("button", { name: "Back", exact: true }).click();
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
  }
  if (runs("classic")) {
    // Existing templates retain complete fallback cards until a valid image is ready.
    await page.unroute("**/api/public-place-photo/**");
    let imageAvailable = false;
    let classicResolves = 0;
    await page.route("**/api/public-place-photo/**", async (route) => {
      if (route.request().url().includes("resolve=1")) {
        classicResolves++;
        if (!imageAvailable) return route.fulfill({ status: 429 });
        const ref = new URL(route.request().url()).pathname.split("/").at(-1);
        return route.fulfill({
          json: {
            id: `google-place:${ref}`,
            kind: "image",
            source: "google_place",
            url: `/api/public-place-photo/${token}/${ref}?fixture=1`,
          },
        });
      }
      return route.fulfill({ contentType: "image/svg+xml", body: svg });
    });
    for (const templateId of ["neon", "bento", "traverse"]) {
      for (const photos of [false, true]) {
        const fixture = structuredClone(parisPublicItinerary);
        fixture.settings.templateId = templateId;
        fixture.settings.templateVersion = templateId === "bento" ? 2 : 1;
        fixture.settings.showPlacePhotos = photos;
        fixture.settings.showMapRoutes = false;
        fixture.days.forEach((day) => {
          day.notes = "";
          day.items.forEach((item) => {
            item.notes = "";
            if (item.type === "activity") item.place.googlePlaceId = `saved-place-${day.dayNumber}`;
          });
        });
        app.setFixture(fixture);
        imageAvailable = false;
        const before = classicResolves;
        await page.goto(`${app.baseUrl}/share/${token}?view=overview`);
        await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
        await page.locator("#public-overview-panel .overview-item-card-v4").first().waitFor();
        if (photos) {
          const deadline = Date.now() + 5000;
          while (classicResolves === before && Date.now() < deadline) await page.waitForTimeout(20);
        }
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        assert.equal(
          await page.locator("#public-overview-panel .overview-item-card-v4.has-media").count(),
          0,
        );
        assert.equal(await page.locator("#public-overview-panel .google-place img").count(), 0);
        if (!photos) assert.equal(classicResolves, before);
        if (photos) {
          await page.waitForTimeout(50);
          assert.ok(
            classicResolves > before,
            "A visible candidate must resolve without reserving a blank photo card.",
          );
          imageAvailable = true;
          await page.reload();
          await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
          await page
            .locator("#public-overview-panel .overview-item-card-v4.has-media")
            .first()
            .waitFor();
          await page.locator("#public-overview-panel .google-place img").first().waitFor();
          const presentation = await page
            .locator("#public-overview-panel .google-place img")
            .first()
            .evaluate((image) => {
              const rect = image.getBoundingClientRect();
              const frame = image.closest(".media-thumb-v4");
              return {
                ratio: rect.width / rect.height,
                naturalRatio: image.naturalWidth / image.naturalHeight,
                filter: getComputedStyle(image).filter,
                transform: getComputedStyle(image).transform,
                frameFilter: getComputedStyle(frame).filter,
                overlay: getComputedStyle(frame, "::after").display,
                frameHeight: frame.getBoundingClientRect().height,
                imageHeight: rect.height,
              };
            });
          assert.ok(Math.abs(presentation.ratio - presentation.naturalRatio) < 0.01);
          assert.equal(presentation.filter, "none");
          assert.equal(presentation.transform, "none");
          assert.equal(presentation.frameFilter, "none");
          assert.equal(presentation.overlay, "none");
          assert.ok(presentation.frameHeight >= presentation.imageHeight - 1);
        }
      }
    }
    console.log(
      "PASS classic templates: disabled/failed photos stay complete, valid photos expand",
    );
  }
  if (runs("gestures") || runs("touch")) {
    for (const templateId of ["ethereal", "journal"]) {
      const fixture = structuredClone(parisPublicItinerary);
      fixture.settings.templateId = templateId;
      fixture.settings.showPlacePhotos = false;
      fixture.settings.showMapRoutes = false;
      fixture.days[0].items.find((item) => item.type === "hotel").notes =
        "Saved itinerary note. ".repeat(150);
      app.setFixture(fixture);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${app.baseUrl}/share/${token}`);
      await page.locator('.public-itinerary-shell[data-public-reader-ready="true"]').waitFor();
      await page.getByRole("tab", { name: "Timeline", exact: true }).click();
      await verifyContinuousReaderAndSheet(page, fixture);
    }
  }
  if (runs("trips")) {
    // Real /trips rendering, filters, role-dependent menu entries, and stable local artwork.
    await page.context().addCookies([designSessionCookie()]);
    const coverEndpoint = `${app.baseUrl}/api/trips/33333333-3333-4333-8333-333333333333/cover-photo`;
    const anonymousCover = await fetch(`${coverEndpoint}?resolve=1`, {
      headers: { "sec-fetch-site": "same-origin" },
    });
    assert.equal(anonymousCover.status, 401, "Trip covers require an authenticated member.");
    const privateHeaders = {
      "sec-fetch-site": "same-origin",
      cookie: `${designSessionCookie().name}=${designSessionCookie().value}`,
    };
    const invalidPhoto = await fetch(
      `${coverEndpoint}?photo=places/saved-city-Paris/photos/mock&signature=${"0".repeat(64)}`,
      { headers: privateHeaders },
    );
    assert.equal(invalidPhoto.status, 404, "Unsigned provider media is never fetched.");
    assert.ok(invalidPhoto.headers.get("cache-control").includes("no-store"));
    const inaccessibleCover = await fetch(
      `${app.baseUrl}/api/trips/99999999-9999-4999-8999-999999999999/cover-photo?resolve=1`,
      { headers: privateHeaders },
    );
    assert.equal(
      inaccessibleCover.status,
      404,
      "An inaccessible trip cannot resolve a provider photo.",
    );
    await page.goto(`${app.baseUrl}/trips`);
    await page.getByRole("button", { name: "Actions for Paris Trip" }).waitFor();
    await page.locator(".trip-cover-photo img").first().waitFor();
    assert.equal(await page.locator(".trip-cover-photo img").first().getAttribute("alt"), "Paris");
    const tripFonts = await page
      .locator(".trip-card-identity")
      .first()
      .evaluate((node) => ({
        title: getComputedStyle(node.children[0]).fontFamily,
        description: getComputedStyle(node.children[1]).fontFamily,
        size: parseFloat(getComputedStyle(node.children[0]).fontSize),
      }));
    assert.equal(
      tripFonts.title,
      tripFonts.description,
      "Trips retains the original sans-serif title font.",
    );
    assert.ok(tripFonts.size >= 18 && tripFonts.size <= 20);
    assert.equal(
      await page.locator(".trip-card-header .trip-cover-photo").count(),
      0,
      "The town photo is a full-card background, not a header thumbnail.",
    );
    // Exercise returning from hover; previous browser stages leave the pointer
    // at arbitrary coordinates that may fall inside a newly rendered card.
    await page.locator("[data-trip-card]").first().hover();
    for (const width of [390, 430, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.mouse.move(0, 0);
      await page.waitForTimeout(320);
      const cardLayout = await page
        .locator(".trip-cover-photo")
        .first()
        .evaluate((photo) => {
          const card = photo.closest("[data-trip-card]");
          return {
            image: photo.querySelector("img").getBoundingClientRect().toJSON(),
            card: card.getBoundingClientRect().toJSON(),
            filter: getComputedStyle(photo.querySelector(".trip-cover-photo-filter"))
              .backgroundColor,
            fit: getComputedStyle(photo.querySelector("img")).objectFit,
            attribution: photo.querySelector("figcaption").getBoundingClientRect().toJSON(),
            footer: card.querySelector(".trip-card-footer").getBoundingClientRect().toJSON(),
            bodyWidth: document.documentElement.scrollWidth,
            width: innerWidth,
            interacting: card.matches(":hover, :focus-within"),
          };
        });
      assert.ok(
        ["top", "bottom", "left", "right"].every(
          (edge) => Math.abs(cardLayout.image[edge] - cardLayout.card[edge]) <= 2,
        ),
        `Town photo fills the entire card: ${JSON.stringify({ width, cardLayout })}`,
      );
      assert.equal(cardLayout.fit, "cover");
      assert.equal(cardLayout.interacting, false, "Measure the settled default card state.");
      assert.ok(
        cardLayout.filter.includes("0.86"),
        `A translucent paper filter keeps the original trip text readable: ${JSON.stringify(cardLayout)}`,
      );
      assert.ok(
        cardLayout.attribution.top >= cardLayout.footer.bottom,
        "Photo attribution stays outside title, footer and action targets.",
      );
      assert.ok(cardLayout.bodyWidth <= cardLayout.width);
      if (directory)
        await page.screenshot({ path: `${directory}/trips-city-background-${width}.png` });
    }

    const glassCard = page.locator("[data-trip-card]").first();
    await glassCard.hover();
    await page.waitForTimeout(320);
    const glass = await glassCard.locator(".trip-cover-photo-filter").evaluate((node) => ({
      blur: getComputedStyle(node).backdropFilter,
      easing: getComputedStyle(node).transitionTimingFunction,
      filter: getComputedStyle(node).backgroundColor,
    }));
    assert.ok(
      glass.blur.includes("12px") &&
        glass.easing.includes("ease-in-out") &&
        glass.filter.includes("0.8"),
      `Trips uses the same frosted-glass hover: ${JSON.stringify(glass)}`,
    );
    if (directory) await glassCard.screenshot({ path: `${directory}/trips-background-hover.png` });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(320);

    tripPhotoSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="#b4c9c0"/><text x="20" y="400" font-size="20">Portrait town photo · test only</text></svg>';
    tripPhotoAuthors = [
      {
        label:
          "An intentionally long photographer attribution that must stay completely visible beside the trip title",
        url: "https://example.invalid/author",
      },
    ];
    await page.reload();
    await page.locator(".trip-cover-photo img").first().waitFor();
    for (const width of [390, 430, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const portrait = await page
        .locator(".trip-cover-photo")
        .first()
        .evaluate((photo) => {
          const image = photo.querySelector("img"),
            rect = image.getBoundingClientRect(),
            card = photo.closest("[data-trip-card]");
          return {
            fit: getComputedStyle(image).objectFit,
            card: card.getBoundingClientRect().toJSON(),
            image: rect.toJSON(),
            caption: photo.querySelector("figcaption").getBoundingClientRect().toJSON(),
            height: rect.height,
            photoBottom: photo.getBoundingClientRect().bottom,
            footerTop: card.querySelector(".trip-card-footer").getBoundingClientRect().top,
            attribution: photo.querySelector("figcaption").textContent,
          };
        });
      assert.ok(
        ["top", "bottom", "left", "right"].every(
          (edge) => Math.abs(portrait.image[edge] - portrait.card[edge]) <= 2,
        ),
        "Portrait town photos also fill the card without adding a thumbnail row.",
      );
      assert.equal(portrait.fit, "cover");
      assert.ok(
        portrait.caption.bottom <= portrait.card.bottom &&
          portrait.caption.top >= portrait.footerTop,
        "Long photo attributions remain completely visible inside the card.",
      );
      assert.ok(portrait.attribution.includes(tripPhotoAuthors[0].label));
    }
    assert.equal(await page.locator("#trip-list svg path[stroke-dasharray]").count(), 0);
    assert.ok(
      (await page.locator(".trip-cover-photo figcaption").first().textContent()).includes(
        "Google Maps",
      ),
    );
    await page.getByRole("button", { name: "Completed", exact: true }).click();
    await page.getByRole("button", { name: "Actions for A shared trip" }).waitFor();
    await page.getByRole("button", { name: "Actions for A shared trip" }).click();
    assert.equal(await page.getByRole("menuitem", { name: "Delete trip", exact: true }).count(), 0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByRole("button", { name: "Actions for Paris Trip" }).waitFor();
    await page.locator(".trip-cover-photo img").first().waitFor();
    assert.equal(await page.locator(".trip-cover-photo img").first().getAttribute("alt"), "Paris");
    await page.getByRole("button", { name: "Actions for Paris Trip" }).click();
    assert.ok(await page.getByRole("menuitem", { name: "Delete trip", exact: true }).isVisible());
    await page.keyboard.press("Escape");
    assert.ok(
      await page.getByRole("link", { name: "Open Paris Trip", exact: true }).getAttribute("href"),
    );
  }
  assert.equal(requests.external, 0);
  assert.deepEqual(errors, []);
  if (directory)
    await writeFile(
      `${directory}/browser-report.json`,
      JSON.stringify({ stage, cases: report, requests, tripPhotoRequests, errors }, null, 2) + "\n",
    );
  console.log(
    `PASS sharing ${stage}: ${report.length} responsive cases, no external provider requests`,
  );
} catch (error) {
  console.error(
    "Last layout responses:",
    scriptResponses?.filter((row) => row.url.endsWith("/app/layout.js")).slice(-4),
  );
  console.error("Browser errors:", JSON.stringify(errors));

  const active = browser
    .contexts()
    .flatMap((context) => context.pages())
    .at(-1);
  if (active)
    console.error(
      "Script error locations:",
      await active.evaluate(() => window.sharingScriptErrors).catch(() => null),
    );
  if (active)
    console.error(
      "Failed page:",
      await active
        .evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 1500) }))
        .catch(() => null),
    );
  throw error;
} finally {
  await browser.close();
  await app.close();
}
