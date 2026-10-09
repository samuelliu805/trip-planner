import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";

const contents = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {I18nProvider} from './src/features/i18n/i18n-provider';
import {OverviewRouteOverlay} from './src/features/routes/overview-route-overlay';
import {DayRouteOverlay} from './src/features/routes/day-route-overlay';
import {useDayRoute} from './src/features/routes/use-day-route';
import {resolveRouteCalculationConfig} from './src/features/routes/plan-config';
import {buildRouteConfigSignature} from './src/features/routes/signatures';
import {AddIdeaToPlan} from './src/features/research/components/add-idea-to-plan';
import {RouteVariantEditorDialog} from './src/features/variants/components/route-variant-editor-dialog';
import {TripMenuAccountActions} from './src/features/trips/components/trip-menu-account-actions';
import {QuickIdeaInput} from './src/features/research/components/quick-idea-input';
const plans = ['Plan A','Plan B'].map((variantName,index)=>({variantId:'plan'+index,variantName,days:[{id:'day'+index,dayNumber:1,date:'2027-02-02',items:[]}]}));
window.fixturePlans=plans;
const variants = plans.map((p,index)=>({id:p.variantId,name:p.variantName,color:index?'#2563eb':'#166534',version:1,days_version:1,items_version:1,content_version:1}));
window.fixtureVariants=variants;
plans.forEach((plan,index)=>plan.variant=variants[index]);
const place = (id,latitude)=>({id,latitude,longitude:139,display_name:id,provider:'google',coordinate_system:'wgs84',provider_place_id:id});
const items = ['A','B'].map((id,index)=>({id,trip_id:'trip',type:'activity',title:id,place_id:id,place:place(id,35+index),day_id:'day',variant_id:'plan0',sort_order:index,details:{},created_at:'2026-01-01T00:00:00Z'}));
const day = {id:'day',day_number:1,items};
function DayFixture() {
  const [state,setState]=React.useState('none');
  const activeDay = {...day,items:state==='invalid'?[items[0]]:state==='stale'?[items[0],{...items[1],place:place('B',37)}]:items};
  const plan={id:'route',trip_id:'trip',day_id:'day',variant_id:'plan0',updated_at:'2026-02-01T00:00:00Z',stops:items.map((i,position)=>({id:'stop'+position,item_id:i.id,position:position+1})),legs:[{position:1,mode:'walk',from_stop_id:'stop0',to_stop_id:'stop1'}],calculation:null};
  const original={variant:{id:'plan0'},days:[day],routePlans:[]};
  const config=resolveRouteCalculationConfig(original,plan).config;
  if(['calculated','stale','invalid'].includes(state)) plan.calculation={config_signature:buildRouteConfigSignature(config,'google'),calculatedLegs:[],computed_at:'2026-02-01T00:00:00Z'};
  const route=useDayRoute({...original,days:[activeDay],routePlans:state==='none'?[]:[plan]},activeDay,'trip');
  return <><div>{['none','saved','calculated','stale','invalid'].map(value=><button key={value} onClick={()=>setState(value)}>{value}</button>)}</div><DayRouteOverlay route={route} onClose={()=>{}}/></>;
}
function OverviewFixture() {
  const [state,setState]=React.useState('none');
  const [editing,setEditing]=React.useState(false);
  const from={id:'a',entries:[{title:'A'}],firstDayLabel:'Day 1'};
  const to={id:'b',entries:[{title:'B'}],firstDayLabel:'Day 2'};
  const leg={position:1,mode:'self_driving',distanceMeters:1000,durationSeconds:60,warnings:[],geometry:[],estimateKind:'provider'};
  const segments=[{position:1,from,to,mode:'self_driving',calculatedLeg:state==='calculated'?leg:undefined}];
  return <><div>{['none','calculated','stale'].map(value=><button key={value} onClick={()=>{setEditing(false);setState(value)}}>{value}</button>)}</div><OverviewRouteOverlay onClose={()=>{}} route={{segments,editing,setEditing,pending:false,calculate:async()=>{window.overviewComputes=(window.overviewComputes||0)+1;setState('calculated')},setMode:()=>{},reset:()=>setState('none')}}/></>;
}
function Fixture() {
  const [editing,setEditing]=React.useState(false);
  return <QueryClientProvider client={new QueryClient()}><I18nProvider initialLocale="en"><main>
    <section data-day style={{position:'relative',height:320}}><DayFixture/></section>
    <section data-overview style={{position:'relative',height:320}}><OverviewFixture/></section>
    <AddIdeaToPlan item={{id:'idea',trip_id:'trip',category:'stay',title:'Hotel',segments:[]}} plan={plans[0]}/>
    <button onClick={()=>setEditing(true)}>Clone Plan</button>
    {editing?<RouteVariantEditorDialog activeVariant={variants[0]} mode="duplicate" open onOpenChange={setEditing} tripId="trip" variants={variants}/>:null}
    <TripMenuAccountActions mobile accountEmail="alice@example.com"/>
    <div data-quick><QuickIdeaInput items={[]} tripId="99999999-9999-4999-8999-999999999999" onSaved={item=>window.quickSaved=item}/></div>
  </main></I18nProvider></QueryClientProvider>;
}
createRoot(document.getElementById('fixture')).render(<Fixture/>);
`;
const bundle = await build({
  stdin: { contents, loader: "tsx", resolveDir: process.cwd() },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  define: {
    "process.env": "{}",
    "process.env.NODE_ENV": '"development"',
    "process.env.NEXT_PUBLIC_MAPS_PROVIDER": '"google"',
  },
  plugins: [
    {
      name: "fixture-boundaries",
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /(?:use-background-actions|use-variant-sync|use-research-sync|planner-runtime-owner|draft-scope)$/,
          },
          (args) => ({ path: args.path.split("/").at(-1), namespace: "fixture" }),
        );
        builder.onResolve({ filter: /idea-page-metadata$/ }, (args) =>
          args.importer.endsWith("idea-capture-actions.ts")
            ? { path: "capture-metadata", namespace: "fixture" }
            : undefined,
        );
        builder.onResolve({ filter: /next\/(navigation|link)$/ }, (args) => ({
          path: args.path,
          namespace: "fixture",
        }));
        builder.onResolve(
          {
            filter:
              /\/actions$|^\.\/actions$|queries$|idea-actions$|idea-plan-variant-actions$|idea-variant-plan-actions$|use-day-route-actions$/,
          },
          (args) => {
            const path = args.path;
            if (args.importer.endsWith("idea-capture-actions.ts"))
              return { path: "capture-storage", namespace: "fixture" };
            if (args.importer.endsWith("quick-idea-input.tsx"))
              return { path: "quick-capture", namespace: "fixture" };
            if (args.importer.endsWith("idea-link-preview.tsx"))
              return { path: "capture-metadata", namespace: "fixture" };
            if (args.importer.endsWith("i18n-provider.tsx"))
              return { path: "locale", namespace: "fixture" };
            if (path.includes("itinerary/actions"))
              return { path: "planner-actions", namespace: "fixture" };
            if (
              args.importer.endsWith("planner-query.ts") ||
              (args.importer.endsWith("add-idea-to-plan.tsx") && path.endsWith("/actions"))
            )
              return { path: "planner-actions", namespace: "fixture" };
            if (args.importer.endsWith("trip-menu-account-actions.tsx"))
              return { path: "logout", namespace: "fixture" };
            if (args.importer.endsWith("route-variant-editor-dialog.tsx"))
              return {
                path: path.endsWith("queries") ? "variants-query" : "variants-actions",
                namespace: "fixture",
              };
            if (args.importer.endsWith("add-idea-to-plan.tsx") && path.includes("idea"))
              return { path, namespace: "fixture" };
            if (path.endsWith("use-day-route-actions"))
              return { path: "day-actions", namespace: "fixture" };
          },
        );
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          loader: "jsx",
          resolveDir: process.cwd(),
          contents:
            args.path === "use-background-actions"
              ? "export function useBackgroundActions(tripId){return {scope:['global','fixture',tripId,'idea-workflows'],completed:[],queue:{operations:[]},accept(intent){window.appliedIdea=intent.input;return intent.input.operationId}}}"
              : args.path === "use-variant-sync"
                ? "export function useVariantSync(){return {project:()=>window.fixtureVariants,queue:{operations:[]},accept(intent){window.cloneInput=intent.input;return {variantId:intent.input.operationId}}}}"
                : args.path === "use-research-sync"
                  ? "export function useResearchSync(){return undefined}"
                  : args.path === "planner-runtime-owner"
                    ? "export function findPlannerRuntime(){};export function ownedPlannerRuntime(){}"
                    : args.path === "draft-scope"
                      ? "export function useDraftScope(trip,resource){return ['global','guest',trip,resource]}"
                      : args.path === "capture-storage"
                        ? "export async function createResearchItem(input){return {data:input}}"
                        : args.path === "capture-metadata"
                          ? "export async function fetchIdeaPageMetadata(){return null};export async function previewIdeaLink(){return {status:'unsupported',title:null}}"
                          : args.path === "quick-capture"
                            ? "export {captureIdea} from './src/features/research/idea-capture-actions';export async function mergeIdeaSource(){return {error:'Unused fixture action'}}"
                            : args.path === "next/navigation"
                              ? "export function useRouter(){return {push:url=>window.lastNavigation=url,refresh:()=>{}}}"
                              : args.path === "next/link"
                                ? "import React from 'react';export default function Link(props){return <a {...props}/>}"
                                : args.path === "locale"
                                  ? "export async function persistLocale(){}"
                                  : args.path === "logout"
                                    ? "export async function logout(){}"
                                    : args.path === "planner-actions"
                                      ? "export async function loadPlannerWorkspace(trip,id){const plan=window.fixturePlans.find(p=>p.variantId===id);return {data:plan?{variant:plan.variant,days:plan.days.map(d=>({...d,day_number:d.dayNumber,items:[]})),routePlans:[]}:null}}"
                                      : args.path === "variants-query"
                                        ? "const mutation={isPending:false,mutateAsync:async input=>{window.cloneInput=input;return {variantId:'clone'}}};export const useCreateRouteVariant=()=>mutation,useDuplicateRouteVariant=()=>mutation,useUpdateRouteVariant=()=>mutation;export const variantListQueryKey=()=>['variants'];"
                                        : args.path === "variants-actions"
                                          ? "export async function loadRouteVariants(){return {data:window.fixtureVariants}}"
                                          : args.path === "day-actions"
                                            ? "export function useDayRouteActions(){return {pending:false,persistAndCalculate:async draft=>{window.dayComputed=draft;return true},clearRoute:async()=>{},reloadLatest:async()=>{}}}"
                                            : args.path.endsWith("idea-variant-plan-actions")
                                              ? "export async function loadIdeaVariantPlans(){return {data:window.fixturePlans}}"
                                              : args.path.endsWith("idea-plan-variant-actions")
                                                ? "export async function applySingleIdeaToBlankVariant(){return {data:{variantId:'new-plan'}}};export const applySingleIdeaToNewVariant=applySingleIdeaToBlankVariant;"
                                                : "export async function applySingleIdea(input){window.appliedIdea=input;return {data:{status:'applied'}}};export const applySingleIdeaWithConfirmedCalendar=applySingleIdea;",
        }));
      },
    },
  ],
});
const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), {
  from: "src/app/globals.css",
});
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  for (const width of [390, 430, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://127.0.0.1/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<div id="fixture"></div>',
      }),
    );
    await page.goto("http://127.0.0.1/ux-fixture");
    await page.addStyleTag({ content: css.css });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForTimeout(100);
    assert.deepEqual(errors, []);
    const day = page.locator("[data-day]");
    const overview = page.locator("[data-overview]");
    await day.getByRole("button", { name: "Compute route", exact: true }).waitFor();
    for (const state of ["none", "saved", "stale", "invalid"]) {
      await day.getByRole("button", { name: state, exact: true }).click();
      assert.equal(await day.getByRole("button", { name: "Edit route", exact: true }).count(), 0);
      assert.equal(await day.getByRole("alert").count(), 0);
      const compute = day.getByRole("button", { name: "Compute route", exact: true });
      assert.equal(await compute.count(), 1);
      if (state === "saved") {
        await compute.click();
        assert.equal(await page.evaluate(() => window.dayComputed.legModes[0]), "walk");
      }
    }
    await day.getByRole("button", { name: "calculated", exact: true }).click();
    assert.equal(await day.getByRole("button", { name: "Edit route", exact: true }).count(), 1);
    for (const state of ["none", "stale"]) {
      await overview.getByRole("button", { name: state, exact: true }).click();
      assert.equal(await overview.getByRole("button", { name: "Edit Overview route" }).count(), 0);
      await overview.getByRole("button", { name: "Compute route", exact: true }).click();
      await overview.getByRole("button", { name: "Edit Overview route" }).waitFor();
    }
    await page.getByRole("button", { name: "Add to Plan", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Apply to Plan B" }).waitFor();
    await dialog.getByRole("checkbox", { name: "Apply to Plan A" }).uncheck();
    await dialog.getByRole("checkbox", { name: "Apply to Plan B" }).check();
    await dialog.getByRole("button", { name: "Add to Plan", exact: true }).click();
    await page.waitForFunction(() => window.lastNavigation === "/trips/trip?variant=plan1");
    assert.equal(await page.evaluate(() => window.appliedIdea.variantId), "plan1");
    await page.getByRole("button", { name: "Clone Plan", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "Plan name" }).inputValue(), "Plan A 1");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Plan B", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "Plan name" }).inputValue(), "Plan B 1");
    await page.getByRole("textbox", { name: "Plan name" }).fill("Custom name");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Plan A", exact: true }).click();
    assert.equal(
      await page.getByRole("textbox", { name: "Plan name" }).inputValue(),
      "Custom name",
    );
    await page.getByRole("button", { name: "Duplicate Plan", exact: true }).click();
    await page.waitForFunction(() => window.cloneInput?.name === "Custom name");
    assert.equal(
      await page.getByRole("link", { name: "alice@example.com", exact: true }).count(),
      1,
    );
    assert.equal(await page.getByRole("link", { name: "Account", exact: true }).count(), 0);
    const quick = page.locator("[data-quick]");
    const booking =
      "https://www.google.com/travel/flights/booking?tfs=CBwQAhqbARIKMjAyNi0xMi0yNSIgCgNTSEESCjIwMjYtMTItMjUaA0hBSyoCSFUyBDczMjAiHwoDSEFLEgoyMDI2LTEyLTI2GgNTWUQqAkhVMgM3NzUoAWoMCAMSCC9tLzBoc3FmagwIAhIIL20vMDZ3amZqDAgCEggvbS8wMTkxNGoHCAESA0NBTmoHCAESA0hLR3IMCAISCC9tLzA2eTU3GpsBEgoyMDI3LTAxLTAyIh8KA1NZRBIKMjAyNy0wMS0wMhoDSEFLKgJIVTIDNzc2IiAKA0hBSxIKMjAyNy0wMS0wMxoDU0hBKgJIVTIENzMxOSgBagwIAhIIL20vMDZ5NTdyDAgDEggvbS8waHNxZnIMCAISCC9tLzA2d2pmcgwIAhIIL20vMDE5MTRyBwgBEgNDQU5yBwgBEgNIS0dAAUgDYNCMAXABggELCP___________wGYAQGyAQkSBy9tLzBuMno&curr=CNY";
    await quick.getByRole("textbox").fill(booking);
    await quick.getByRole("button", { name: "Save Flight", exact: true }).click();
    await page.waitForFunction(
      () => window.quickSaved?.title === "SHA → HAK → SYD → HAK → SHA Dec 25 2026",
    );
    await quick.getByRole("textbox").fill(`New Zealand flights ${booking}`);
    await quick.getByRole("button", { name: "Save Flight", exact: true }).click();
    await page.waitForFunction(() => window.quickSaved?.title === "New Zealand flights");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "PASS idea navigation, clone names, route compute states and account identity at 390/430/768/1280px",
  );
} finally {
  await browser.close();
}
