import assert from "node:assert/strict";
import { build } from "esbuild";

export async function verifyPanelPolish({ page, directory }) {
  const bundle = await build({
    entryPoints: ["scripts/fixtures/panel-polish.tsx"],
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
  await page.addScriptTag({ type: "module", content: bundle.outputFiles[0].text });
  try {
    for (const width of [390, 430, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator("#test-cost").click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await settle(dialog);
      await checkHeader(dialog, "[data-sheet-close]");
      const original = dialog.locator(".plan-cost-breakdown li").first();
      assert.equal((await original.textContent()).match(/CNY/g)?.length, 1);
      assert.ok(!(await original.textContent()).includes("¥"));
      assert.ok((await original.textContent()).includes("7,724.00"));
      assert.ok((await dialog.textContent()).includes("2026-09-30"));
      const total = dialog.locator("[data-plan-cost-total]");
      assert.ok((await total.textContent()).includes("USD"));
      const geometry = await dialog.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const footer = node.querySelector(".plan-cost-breakdown > p").getBoundingClientRect();
        return {
          overflow: node.scrollWidth > node.clientWidth,
          bottomGap: rect.bottom - footer.bottom,
          font: getComputedStyle(node).fontFamily,
          center: (rect.left + rect.right) / 2,
        };
      });
      assert.equal(geometry.overflow, false);
      assert.ok(geometry.bottomGap <= 2);
      assert.ok(!/mono|hand|caveat/i.test(geometry.font));
      assert.ok(Math.abs(geometry.center - width / 2) <= 2);
      if (directory) await page.screenshot({ path: `${directory}/plan-cost-${width}.png` });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page.locator("#test-dialog").click();
      await dialog.waitFor();
      await settle(dialog);
      await checkHeader(dialog, "[data-dialog-close]");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
    }
    await page.locator("#test-long-cost").click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await settle(dialog);
    const before = await dialog.locator("h2").boundingBox();
    const scrollers = await dialog.evaluate((node) =>
      [...node.querySelectorAll("*")]
        .filter(
          (child) =>
            /auto|scroll/.test(getComputedStyle(child).overflowY) &&
            child.scrollHeight > child.clientHeight + 1,
        )
        .map((child) => {
          child.scrollTop = child.scrollHeight;
          return child.tagName;
        }),
    );
    assert.equal(scrollers.length, 1, "Long cost panels have one intentional body scroller.");
    const after = await dialog.locator("h2").boundingBox();
    assert.ok(Math.abs(before.y - after.y) <= 1, "Header stays fixed while costs scroll.");
    assert.equal(await dialog.locator("li").count(), 40);
    assert.equal(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth), false);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    console.log(
      "PASS modal title/close alignment, compact cost layout, original currency, responsive overflow and single body scroller",
    );
  } finally {
    await page.evaluate(() => window.disposePanelPolish());
  }
}

async function settle(dialog) {
  await dialog.evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
}
async function checkHeader(dialog, selector) {
  const result = await dialog.evaluate((node, selector) => {
    const title = node.querySelector("h2"),
      close = node.querySelector(selector);
    const a = title.getBoundingClientRect(),
      b = close.getBoundingClientRect();
    return {
      weight: Number(getComputedStyle(title).fontWeight),
      difference: Math.abs((a.top + a.bottom - b.top - b.bottom) / 2),
      width: b.width,
      height: b.height,
      overlap: a.right > b.left,
    };
  }, selector);
  assert.ok(
    result.weight >= 700 && result.difference <= 1 && !result.overlap,
    JSON.stringify(result),
  );
  assert.ok(result.width >= 44 && result.height >= 44);
}
