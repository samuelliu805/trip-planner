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
        return <><button onClick={() => setVersion(v => v + 1)}>Rebuild map</button>
          <button onClick={() => setPresentation(v => v + 1)}>Change marker</button>
          <button onClick={() => setOpen(v => !v)}>Back</button>
          {open ? <APIProvider apiKey="mock-only"><Map mapId={'test-' + version} defaultCenter={{lat:48.85,lng:2.35}} defaultZoom={10}>
            <GooglePlannerMapMarkerOverlay marker={{...marker, appearance: presentation === 1 ? 'comparison-active' : presentation === 2 ? 'overview' : 'category', label: presentation === 2 ? 'Paris city' : '1', variantName: 'Route A'}} onMarkerClick={() => {}} />
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
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.locator("[data-mock-google-pin=ready]").waitFor();
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: "Rebuild map", exact: true }).click();
    await page.waitForTimeout(100);
    assert.deepEqual(
      errors,
      [],
      `Map rebuild must preserve React-owned nodes: ${errors.join("; ")}`,
    );
    await page.locator("[data-mock-google-pin=ready]").waitFor();
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
