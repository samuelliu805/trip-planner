import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";

const contents = `
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {I18nProvider} from './src/features/i18n/i18n-provider';
  import {Dialog,DialogContent,DialogTitle} from './src/components/ui/dialog';
  import {DropdownMenu,DropdownMenuContent,DropdownMenuTrigger} from './src/components/ui/dropdown-menu';
  import {IdeaVariantTarget} from './src/features/research/components/idea-variant-target';
  import {initialIdeaVariantPlacement} from './src/features/research/idea-variant-placement';
  import {PublicItemDetails} from './src/features/sharing/components/public-item-details';
  import {PlannerContextMenuItems,PlannerMobileMenuItems} from './src/features/itinerary/components/planner-context-menu-items';
  const entries = [
    {id:'museum',title:'Museum',type:'activity'},
    {id:'drive',title:'Drive',type:'transport'},
    {id:'meal',title:'Dinner',type:'meal'},
    {id:'hotel',title:'Hotel',type:'hotel'},
    {id:'flight-stop',title:'Flight departure',type:'activity',details:{flightEndpointParentId:'flight'}},
  ];
  const plan = {variantId:'plan',variantName:'Plan A',days:[
    {id:'day1',dayNumber:1,date:'2027-02-10',items:entries},
    {id:'day2',dayNumber:2,date:'2027-02-11',items:entries},
  ]};
  function Placement({category}) {
    const item = {category,start_date:'2027-02-11',start_time:null,segments:[]};
    const [placement,setPlacement] = React.useState(()=>initialIdeaVariantPlacement(item,plan));
    return <><IdeaVariantTarget item={item} onPlacementChange={setPlacement} onSelectedChange={()=>{}}
      placement={placement} plan={plan} selected/><output data-placement>{JSON.stringify(placement)}</output></>;
  }
  const menuProps = {trip:{id:'trip',currency:'CNY'},selectedCount:1,researchContext:{itemId:'hotel',label:'Hotel',category:'stay'},
    researchItems:[],planDays:[],workspaceDayCount:2,clearItemCount:0,activeDay:null};
  function Fixture() {
    const [category,setCategory] = React.useState(null);
    return <I18nProvider initialLocale="zh-CN"><main className="p-4 space-y-4">
      <PublicItemDetails item={{ref:'hotel',sortOrder:0,type:'hotel',title:'湖畔酒店',place:{displayName:'湖畔酒店',
        address:'杭州市西湖区一号',latitude:30.25,longitude:120.15,googlePlaceId:'google-place'}}}/>
      <button onClick={()=>setCategory('stay')}>Open hotel</button>
      <button onClick={()=>setCategory('activity')}>Open activity</button>
      <button onClick={()=>setCategory('flight')}>Open flight</button>
      <DropdownMenu><DropdownMenuTrigger>Desktop menu</DropdownMenuTrigger><DropdownMenuContent>
        <PlannerContextMenuItems {...menuProps} onRequestRemoveDay={()=>{}}/>
      </DropdownMenuContent></DropdownMenu>
      <section data-mobile-menu><PlannerMobileMenuItems props={menuProps} runAction={action=>action()}/></section>
      <Dialog open={!!category} onOpenChange={open=>!open&&setCategory(null)}><DialogContent className="max-w-full overflow-x-hidden sm:max-w-lg">
        <DialogTitle>Placement</DialogTitle><div className="max-h-[65dvh] overflow-y-auto px-5 py-4">
          {category?<Placement key={category} category={category}/>:null}
        </div>
      </DialogContent></Dialog>
    </main></I18nProvider>;
  }
  createRoot(document.getElementById('fixture')).render(<Fixture/>);
`;

async function bundle(provider) {
  return build({
    stdin: { contents, loader: "tsx", resolveDir: process.cwd() },
    plugins: [
      {
        name: "fixture-server-boundaries",
        setup(builder) {
          builder.onResolve({ filter: /^\.\/actions$/ }, (args) =>
            args.importer.endsWith("i18n-provider.tsx")
              ? { path: "locale", namespace: "fixture" }
              : undefined,
          );
          builder.onResolve({ filter: /^\.\/public-item-media$/ }, () => ({
            path: "media",
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            loader: "js",
            contents:
              args.path === "locale"
                ? "export async function persistLocale() {}"
                : "export function PublicItemMediaGallery() { return null; }",
          }));
        },
      },
    ],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    define: {
      "process.env.NODE_ENV": '"development"',
      "process.env.NEXT_PUBLIC_MAPS_PROVIDER": JSON.stringify(provider),
    },
  });
}

const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), {
  from: "src/app/globals.css",
});
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  for (const provider of ["google", "amap"]) {
    const script = await bundle(provider);
    const context = await browser.newContext({ hasTouch: true });
    await context.route(/https:\/\/(www\.google\.com|uri\.amap\.com)\//, (route) =>
      route.fulfill({ contentType: "text/plain", body: "Map opened" }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of [390, 430, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("about:blank");
      await page.setContent('<div id="fixture"></div>');
      await page.addStyleTag({ content: css.css });
      await page.addScriptTag({ content: script.outputFiles[0].text });
      const link = page.getByRole("link", {
        name: provider === "amap" ? "在高德地图中打开" : "在 Google 地图中打开",
      });
      await link.waitFor();
      assert.match(
        await link.getAttribute("href"),
        provider === "amap"
          ? /^https:\/\/uri\.amap\.com\/marker/
          : /^https:\/\/www\.google\.com\/maps\/search/,
      );
      const popupPromise = page.waitForEvent("popup");
      await link.click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      assert.equal(await popup.locator("body").textContent(), "Map opened");
      await popup.close();
      assert.doesNotMatch(
        await page.locator("[data-mobile-menu]").innerText(),
        /比较价格|保存灵感/,
      );
      await page.getByRole("button", { name: "Desktop menu", exact: true }).click();
      assert.doesNotMatch(await page.getByRole("menu").innerText(), /比较价格|保存灵感/);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Open hotel", exact: true }).click();
      const dialog = page.getByRole("dialog");
      assert.match(
        await dialog.getByRole("combobox", { name: "行程日期" }).innerText(),
        /第2天.*2027-02-11/,
      );
      assert.equal(await dialog.getByRole("combobox").count(), 1);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Open activity", exact: true }).click();
      await dialog.getByRole("combobox", { name: "位置", exact: true }).click();
      const options = await page.getByRole("option").allTextContents();
      assert.deepEqual(options, ["放在最后", "放在Museum之前", "放在Dinner之前"]);
      await page.getByRole("option", { name: "放在Museum之前", exact: true }).click();
      assert.match(
        await dialog.locator("[data-placement]").textContent(),
        /"beforeItemId":"museum"/,
      );
      await dialog.getByRole("combobox", { name: "行程日期" }).click();
      await page.getByRole("option", { name: /第1天/ }).click();
      assert.match(await dialog.locator("[data-placement]").textContent(), /"beforeItemId":""/);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Open flight", exact: true }).click();
      assert.match(
        await dialog.locator("[data-placement]").textContent(),
        /"anchorDayNumber":null/,
      );
      await page.keyboard.press("Escape");
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  process.stdout.write(
    "PASS Global/CN map opening, idea day prefill, legal order, simplified menus and 390/430/768px dialogs\n",
  );
} finally {
  await browser.close();
}
