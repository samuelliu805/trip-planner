import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startPublicSharingDesignRuntime } from "./lib/public-sharing-design-runtime.mjs";

// Actual Next routes and Guest storage, with a local backend adapter. This never
// authenticates to a managed provider or publishes the Guest fixture.
const app = await startPublicSharingDesignRuntime();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors = [];
let primaryFailure;
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${app.baseUrl}/guest`);
  await page.locator("[data-guest-planner]").waitFor();
  await page.locator('[data-guest-save-state="saved"]').first().waitFor();
  const guest = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("trip-planner:guest-trip:global:active")));
  const initial = await guest();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Add first activity", exact: true }).first().click();
  const search = page.getByRole("combobox", { name: "Place or activity name", exact: true });
  await search.fill("离线徒步 A");
  await search.press("Enter");
  await page.getByRole("button", { name: "Save & create new", exact: true }).click();
  await search.fill("未完成的 B 中文输入");
  await page.keyboard.press("Escape");
  await page.locator('[data-guest-save-state="saved"]').first().waitFor();
  const edited = await guest();
  assert.equal(edited.draftId, initial.draftId);
  assert.equal(
    edited.workspace.days[0].items.filter((item) => item.title === "离线徒步 A").length,
    1,
  );
  assert.equal(
    edited.workspace.days[0].items.filter((item) => item.title === "未完成的 B 中文输入").length,
    0,
  );
  await page.getByRole("button", { name: "Add activities on day 1", exact: true }).click();
  assert.equal(await search.inputValue(), "未完成的 B 中文输入");
  await page.keyboard.press("Escape");
  // The loaded app works offline. Reload uses the available app shell; a cold
  // uncached offline navigation is not represented as service-worker support.
  await context.setOffline(false);
  await page.reload();
  await page.locator("[data-guest-planner]").waitFor();
  await page.getByRole("button", { name: "Add activities on day 1", exact: true }).click();
  assert.equal(await search.inputValue(), "未完成的 B 中文输入");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Trip menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Trip settings", exact: true }).click();
  const title = page.locator("#guest-trip-title");
  await title.fill("");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Trip menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Trip settings", exact: true }).click();
  assert.equal(await title.inputValue(), "");
  await title.fill("离线旅行设置");
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("trip-planner:guest-trip:global:active"))?.trip.title ===
      "离线旅行设置",
  );
  await page.getByRole("button", { name: "Ideas & Options", exact: true }).click();
  const quick = page.getByPlaceholder("Paste a link or write an idea", { exact: true });
  await quick.fill("尚未保存的中文 Idea");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: "Ideas & Options", exact: true }).click();
  assert.equal(await quick.inputValue(), "尚未保存的中文 Idea");
  await page.reload();
  await page.locator("[data-guest-planner]").waitFor();
  await page.getByRole("button", { name: "Ideas & Options", exact: true }).click();
  assert.equal(await quick.inputValue(), "尚未保存的中文 Idea");
  assert.deepEqual(errors, []);
  console.log(
    "PASS actual Guest route: loaded offline editing, Save & add another, incomplete draft recovery, settings close flush, Plan/Ideas switch and reload.",
  );
} catch (error) {
  primaryFailure = error;
  console.error({ errors, body: (await page?.locator("body").innerText())?.slice(-2400) });
  throw error;
} finally {
  const cleanup = await Promise.allSettled([browser.close(), app.close()]);
  const failures = cleanup
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (failures.length)
    throw new AggregateError(
      [...(primaryFailure ? [primaryFailure] : []), ...failures],
      "Guest browser validation cleanup failed.",
    );
}
