import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";

const bundle = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { I18nProvider } from './src/features/i18n/i18n-provider';
      import { BookingPriceFields } from './src/features/itinerary/components/booking-price-fields';
      import { plannerItemSaveValues } from './src/features/itinerary/components/planner-item-save-values';
      import { JourneyFieldPages } from './src/features/research/components/research-journey-field-pages';
      import { researchItemInputFromForm } from './src/features/research/research-item-form-values';
      import { GoogleMarkerLabelBubble } from './src/lib/providers/google/maps/google-marker-label-bubble';
      import { ArrangeActivitiesSheet } from './src/features/itinerary/components/arrange-activities-sheet';
      import { useDayRoute } from './src/features/routes/use-day-route';
      import { createAmapOverlays } from './src/lib/providers/amap/maps/amap-map-overlays';
      const place = (id, latitude) => ({id, latitude, longitude:139, displayName:id});
      const item = (id, type, order, latitude, created_at = '2026-10-02T09:00:00Z') => ({id, type, title:id, sort_order:order, created_at, updated_at:created_at, place:place(id, latitude)});
      const previous = {id:'day1', day_number:1, items:[item('previous-hotel', 'hotel', 1, 35)]};
      const day = {id:'day2', day_number:2, items:[item('museum', 'activity', 1, 36), item('overnight', 'hotel', 2, 37, '2026-10-02T11:00:00Z')]};
      function RouteFixture() {
        const [samePlace, setSamePlace] = React.useState(false);
        const activeDay = samePlace ? {...day, items:day.items.map(i => ({...i, place:place(i.id, 35)}))} : day;
        const route = useDayRoute({variant:{id:'variant'}, days:[previous,activeDay], routePlans:[]},activeDay,'trip');
        return <section><button onClick={() => setSamePlace(v=>!v)}>Toggle same place</button>
          <button disabled={!route.canComputeDefault}>Calculate day</button>
          <output data-route>{JSON.stringify(route.displayDraft)}</output></section>;
      }
      function AmapLabels() {
        const root = React.useRef(null);
        React.useEffect(() => {
          class Marker {constructor(options) {this.options=options;}}
          const overlays = createAmapOverlays({amap:{Marker}, lines:[], map:{add:markers=>markers.forEach(marker=>root.current.append(marker.options.content)),remove:markers=>markers.forEach(marker=>marker.options.content.remove())}, onMarkerClick:()=>{}, markers:['出 · 1','到 · 2','1 · 3 · 5 · 7 · 9 · 11 · 13 · 15 · 17 · 19'].map((label,index)=>({id:'amap-'+index,itemIds:['item-'+index],latitude:35,longitude:139,appearance:'route-planned',label,entries:[{itemId:'item-'+index,kind:'activity',title:label,dayNumber:1,dayLabel:'Day 1'}]}))});
          return ()=>overlays.release();
        },[]);
        return <div ref={root} className="flex flex-wrap gap-3"/>;
      }
      function Fixture() {
        const [arranging,setArranging] = React.useState(false);
        const [amount, setAmount] = React.useState('');
        const [currency, setCurrency] = React.useState('USD');
        const [saved, setSaved] = React.useState(null);
        return <I18nProvider initialLocale="zh-CN"><main className="mx-auto max-w-3xl space-y-6 p-4">
          <form onSubmit={e => {e.preventDefault();setSaved({
            research:researchItemInputFromForm({category:'flight', form:new FormData(e.currentTarget), tripId:'trip'}).totalPriceAmount,
            planner:plannerItemSaveValues({type:'hotel', tripId:'trip', variantId:'variant', state:{title:'Hotel', priceAmount:amount, priceCurrency:currency, links:[], existingDetails:{}, place:null}}).priceAmount
          });}}>
            <BookingPriceFields amount={amount} amountName="totalPriceAmount" currency={currency} currencyName="currency" defaultCurrency="USD" idPrefix="price" onAmountChange={setAmount} onCurrencyChange={setCurrency}/>
            <button type="submit">Save price</button><output data-saved>{JSON.stringify(saved)}</output>
          </form>
          <form data-flight><JourneyFieldPages activeStepId="primary" category="flight"/></form>
          <RouteFixture/><AmapLabels/>
          <button onClick={()=>setArranging(true)}>Open two-flight arrangement</button>
          <ArrangeActivitiesSheet open={arranging} onOpenChange={setArranging} onCommit={async()=>true} onReloadLatest={async()=>{}} pending={false} conflict={false} reloadPending={false} day={{id:'day',day_number:11,items:[
            {...item('Paris 08:25','activity',0,35),start_time:'08:25:00',details:{flightEndpointParentId:'flight1',flightEndpointRole:'departure',flightEndpointDate:'2027-02-14'}},
            {...item('Brussels 12:20','activity',1,35),start_time:'12:20:00',details:{flightEndpointParentId:'flight2',flightEndpointRole:'departure',flightEndpointDate:'2027-02-14'}},
            {...item('Brussels 09:25','activity',2,35),start_time:'09:25:00',details:{flightEndpointParentId:'flight1',flightEndpointRole:'arrival',flightEndpointDate:'2027-02-14'}},
            {...item('Beijing 04:40','activity',3,35),start_time:'04:40:00',details:{flightEndpointParentId:'flight2',flightEndpointRole:'arrival',flightEndpointDate:'2027-02-15'}}
          ]}}/>
          <GoogleMarkerLabelBubble background="#166534" color="#fff" label="出 · 1" selected={false}/>
          <GoogleMarkerLabelBubble background="#166534" color="#fff" label="到 · 2" selected/>
          <GoogleMarkerLabelBubble background="#166534" color="#fff" label="1 · 3 · 5 · 7 · 9 · 11 · 13 · 15 · 17 · 19" selected={false}/>
        </main></I18nProvider>;
      }
      createRoot(document.getElementById('fixture')).render(<Fixture/>);`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  plugins: [
    {
      name: "loopback-fixture-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/actions$/, namespace: "file" }, (args) =>
          args.importer.endsWith("i18n-provider.tsx")
            ? { path: "locale", namespace: "fixture" }
            : undefined,
        );
        builder.onResolve({ filter: /place-autocomplete$/ }, () => ({
          path: "place",
          namespace: "fixture",
        }));
        builder.onResolve({ filter: /use-day-route-actions$/ }, () => ({
          path: "route-actions",
          namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          loader: "js",
          contents:
            args.path === "locale"
              ? "export async function persistLocale() {}"
              : args.path === "place"
                ? "export function PlaceAutocomplete() { return null; }"
                : "export function useDayRouteActions() {return {clearRoute:async()=>{},pending:false,persistAndCalculate:async()=>{},reloadLatest:async()=>{}};}",
        }));
      },
    },
  ],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  define: {
    "process.env": "{}",
    "process.env.NODE_ENV": '"development"',
    "process.env.NEXT_PUBLIC_TELEMETRY_ENABLED": '"false"',
  },
});
const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), {
  from: "src/app/globals.css",
});
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({ hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [390, 430, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("about:blank");
    await page.setContent('<div id="fixture"></div>');
    await page.addStyleTag({ content: css.css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page
      .locator("#price-amount")
      .waitFor({ timeout: 5000 })
      .catch((error) => {
        throw new Error(`${error.message}; fixture errors: ${errors.join("; ")}`);
      });
    const price = page.locator("#price-amount");
    await price.fill("(120 + 30) * 2 / 3");
    await price.press("Enter");
    await page.waitForFunction(
      () => document.querySelector("[data-saved]").textContent === '{"research":100,"planner":100}',
    );
    await price.press("Tab");
    assert.equal(await price.inputValue(), "100");
    await price.fill("1 / 0");
    await price.press("Tab");
    assert.equal(await price.inputValue(), "0");
    await price.fill("");
    await page.getByText("Save price", { exact: true }).click();
    assert.deepEqual(JSON.parse(await page.locator("[data-saved]").textContent()), {
      research: null,
      planner: null,
    });
    const flight = page.locator("[data-flight]");
    await flight.locator("select").selectOption("round_trip");
    await flight.locator('input[type="date"]').nth(0).fill("2028-02-27");
    await flight.locator('input[type="time"]').nth(0).fill("09:30");
    let segments = JSON.parse(await flight.locator('[name="segments"]').inputValue());
    assert.equal(segments[1].departureDate, "2028-03-01");
    assert.equal(segments[1].arrivalDate, "2028-03-01");
    assert.equal(segments[1].departureTime, "09:30");
    await flight.locator('input[type="date"]').nth(2).fill("2028-03-10");
    await flight.locator("select").selectOption("multi_city");
    await flight.getByRole("button", { name: /添加.*航班|Add another flight/ }).click();
    segments = JSON.parse(await flight.locator('[name="segments"]').inputValue());
    assert.equal(segments[1].departureDate, "2028-03-10");
    assert.equal(segments[1].arrivalDate, "2028-03-10");
    assert.equal(segments[2].departureDate, "2028-03-13");
    assert.equal(segments[2].departureTime, "09:30");
    for (const wrapper of await page.locator("[data-native-select]").all()) {
      const select = await wrapper.locator("select").boundingBox();
      const caret = await wrapper.locator("[data-native-select-caret]").boundingBox();
      assert.ok(Math.abs(caret.y + caret.height / 2 - select.y - select.height / 2) <= 1);
      assert.ok(caret.width >= 20 && select.x + select.width - caret.x - caret.width >= 15);
    }
    for (const text of await page.locator("[data-map-label-text]").all()) {
      assert.ok(
        await text.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(node);
          return (
            [...range.getClientRects()].every(
              (rect) =>
                rect.left >= bounds.left &&
                rect.right <= bounds.right &&
                rect.top >= bounds.top &&
                rect.bottom <= bounds.bottom,
            ) && node.scrollWidth <= node.clientWidth
          );
        }),
        `Map label fits its bubble at ${width}px`,
      );
    }
    assert.deepEqual(JSON.parse(await page.locator("[data-route]").textContent()).itemIds, [
      "previous-hotel",
      "museum",
      "overnight",
    ]);
    assert.equal(await page.getByText("Calculate day", { exact: true }).isEnabled(), true);
    await page.getByText("Toggle same place", { exact: true }).click();
    assert.equal(await page.getByText("Calculate day", { exact: true }).isDisabled(), true);
    await page.getByText("Open two-flight arrangement", { exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const text = await dialog.innerText();
    const chronological = ["Paris 08:25", "Brussels 09:25", "Brussels 12:20", "Beijing 04:40"];
    assert.ok(
      chronological.every(
        (name, index) => index === 0 || text.indexOf(name) > text.indexOf(chronological[index - 1]),
      ),
      "Arrangement shows actual overnight flight chronology",
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "Forms fit the viewport",
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS price arithmetic submission, flight prefill, dropdown geometry, hotel defaults, distinct-place readiness and Chinese marker bubbles at 390/430/768px",
  );
} finally {
  await browser.close();
}
