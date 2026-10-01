import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { installGoogleMapsMock } from "./lib/public-sharing-google-sdk.mjs";

// Rebuilding the map keeps its React marker mounted while useMap transitions through null.
// The SDK's Pin component previously replaced React-owned descendants during that transition.
const bundle = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { APIProvider, Map } from '@vis.gl/react-google-maps';
      import { GooglePlannerMapMarkerOverlay } from './src/lib/providers/google/maps/google-planner-map-marker';
      const marker = {id:'stop', latitude:48.85, longitude:2.35, itemIds:['item'], entries:[{itemId:'item', title:'Museum', dayLabel:'Day 1', dayNumber:1, kind:'activity'}]};
      function Fixture() {
        const [version, setVersion] = React.useState(1);
        const [open, setOpen] = React.useState(true);
        const [presentation, setPresentation] = React.useState(0);
        const [selected, setSelected] = React.useState(undefined);
        return <><button onClick={() => setVersion(v => v + 1)}>Rebuild map</button>
          <button onClick={() => setPresentation(v => v + 1)}>Change marker</button>
          <button onClick={() => setOpen(v => !v)}>Back</button>
          <p>{selected ? 'Selected item' : 'Nothing selected'}</p>
          {open ? <APIProvider apiKey="mock-only"><Map mapId={'test-' + version} defaultCenter={{lat:48.85,lng:2.35}} defaultZoom={10}>
            <GooglePlannerMapMarkerOverlay marker={{...marker, appearance: presentation === 1 ? 'comparison-active' : presentation === 2 ? 'overview' : 'category', label: presentation === 2 ? 'Paris city' : '1', variantName: 'Route A'}} onMarkerClick={setSelected} selectedId={selected} />
          </Map></APIProvider> : <p>Reader restored</p>}</>;
      }
      createRoot(document.getElementById('fixture')).render(<Fixture/>);`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"development"' },
});
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(installGoogleMapsMock);
  await page.goto("about:blank");
  await page.setContent('<div id="fixture" style="height:600px"></div>');
  await page.evaluate(() => {
    window.mockAdvancedMarkerMapFailure = true;
    window.mockDeferredOverlayRemoval = true;
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.locator("[data-mock-google-pin=ready]").waitFor();
  const target = page.getByRole("button", { name: "activity: Museum, Day 1", exact: true });
  const bounds = await target.boundingBox();
  assert.ok(bounds.width >= 44 && bounds.height >= 44, "Map markers retain touch targets.");
  await target.hover();
  await target.focus();
  assert.ok(await page.getByText("Nothing selected", { exact: true }).isVisible());
  await page.keyboard.press("Enter");
  await page.getByText("Selected item", { exact: true }).waitFor();
  await target.click();
  await page.getByText("Nothing selected", { exact: true }).waitFor();
  await target.focus();
  await page.keyboard.press("Space");
  await page.getByText("Selected item", { exact: true }).waitFor();
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: "Rebuild map", exact: true }).click();
    await page.waitForTimeout(100);
    assert.deepEqual(
      errors,
      [],
      `Map rebuild must preserve React-owned nodes: ${errors.join("; ")}`,
    );
    await page.locator("[data-mock-google-pin=ready]").waitFor();
    assert.equal(
      await page.locator("[data-mock-google-marker]").count(),
      1,
      "Deferred cleanup cannot remove or duplicate the current marker.",
    );
  }
  await page.getByRole("button", { name: "Change marker", exact: true }).click();
  await page.waitForTimeout(100);
  assert.deepEqual(
    errors,
    [],
    `Changing marker composition must not remove React-owned nodes: ${errors.join("; ")}`,
  );
  await page.getByRole("button", { name: "Change marker", exact: true }).click();
  await page.getByText("Paris city", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByText("Reader restored", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-mock-google-marker]").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS Google marker lifecycle: map rebuilds, marker teardown and reader restoration without provider calls",
  );
} finally {
  await browser.close();
}
