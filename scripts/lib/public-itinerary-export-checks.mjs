import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";
import { verifyPublicItineraryExports } from "./public-itinerary-export-live.mjs";

const token = "11111111-1111-4111-8111-111111111111";

export async function checkPublicItineraryDataExports(page, app) {
  await verifyPublicItineraryExports(app.baseUrl, token, {
    title: parisPublicItinerary.trip.title,
  });
  const auth = await promisify(execFile)(
    process.execPath,
    ["scripts/check-auth-routes.mjs", app.baseUrl],
    { env: { ...process.env, APP_REGION: "global" } },
  );
  assert.match(auth.stdout, /Public auth routes are healthy/);
  const exportUrl = `${app.baseUrl}/share/${token}/export?format=json`;
  const readClipboard = () => page.evaluate(() => navigator.clipboard.readText());
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/public-place-photo/**", (route) => route.abort());
  const dialog = page.locator(".public-viewer-share-dialog");
  for (const width of [390, 430, 768, 820, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole("button", { name: "Share itinerary", exact: true })
      .filter({ visible: true })
      .click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Copy itinerary data", exact: true }).click();
    await dialog.getByText("Itinerary copied.", { exact: true }).waitFor();
    assert.equal(JSON.parse(await readClipboard()).schemaVersion, 1);
    const geometry = await dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        overflow: document.documentElement.scrollWidth > innerWidth,
        smallTargets: [...node.querySelectorAll("button, select, input, a")]
          .filter(
            (entry) => entry.getClientRects().length && entry.getBoundingClientRect().height < 43,
          )
          .map((entry) => entry.textContent),
      };
    });
    assert.ok(geometry.left >= -1 && geometry.right <= width + 1, JSON.stringify(geometry));
    assert.ok(geometry.top >= -1 && geometry.bottom <= 901, JSON.stringify(geometry));
    assert.equal(geometry.overflow, false);
    assert.deepEqual(geometry.smallTargets, []);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
  }
  await page
    .getByRole("button", { name: "Share itinerary", exact: true })
    .filter({ visible: true })
    .click();
  await dialog.getByRole("button", { name: "Copy export link", exact: true }).click();
  await dialog.getByText("Export link copied.", { exact: true }).waitFor();
  assert.equal(await readClipboard(), exportUrl);
  await dialog.getByLabel("Export format", { exact: true }).selectOption("csv");
  await dialog.getByRole("button", { name: "Copy itinerary data", exact: true }).click();
  await dialog.getByText("Itinerary copied.", { exact: true }).waitFor();
  assert.ok((await readClipboard()).startsWith('"schema_version","trip_title"'));
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Download data", exact: true }).click();
  const download = await downloading;
  assert.equal(download.suggestedFilename(), "itinerary.csv");
  assert.equal(await readFile(await download.path(), "utf8"), await readClipboard());
  // A page left open before revocation must not copy a stale itinerary snapshot.
  app.setFixture({ available: false });
  try {
    await dialog.getByRole("button", { name: "Copy itinerary data", exact: true }).click();
    await dialog
      .getByText("Could not copy the export. Try downloading it instead.", { exact: true })
      .waitFor();
    for (const format of ["json", "csv"]) {
      const response = await fetch(`${app.baseUrl}/share/${token}/export?format=${format}`);
      assert.equal(response.status, 404);
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
  } finally {
    app.setFixture(structuredClone(parisPublicItinerary));
  }
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 900 });
  console.log(
    "PASS anonymous JSON/CSV exports, real clipboard/download, revoked links, mobile/tablet dialog, public auth routes",
  );
}
