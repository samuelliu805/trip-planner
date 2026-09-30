import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startPublicSharingDesignRuntime } from "./lib/public-sharing-design-runtime.mjs";
import { checkPublicSharingExports } from "./lib/public-sharing-export-checks.mjs";
const directory = process.env.PUBLIC_SHARING_DESIGN_ARTIFACT_DIR;
if (directory) await mkdir(directory, { recursive: true });
const app = await startPublicSharingDesignRuntime();
let browser;
try {
  const executablePath = [
    process.env.CHROME_PATH,
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].find((path) => path && existsSync(path));
  browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const forbidden = [];
  page.on("request", (r) => {
    if (/must-not-be|public-place-photo|googleapis|openai.com|anthropic/.test(r.url()))
      forbidden.push(r.url());
  });
  await page.goto(`${app.baseUrl}/share/11111111-1111-4111-8111-111111111111`);
  await page.locator(".itinerary-edition").first().waitFor();
  await checkPublicSharingExports(page, directory);
  if (forbidden.length) throw new Error("Export requested protected media: " + forbidden.join(","));
} finally {
  await browser?.close();
  await app.close();
}
