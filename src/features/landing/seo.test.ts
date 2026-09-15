import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getLandingStructuredData,
  serializeStructuredData,
  tripPlannerSeoForRegion,
} from "./seo.ts";
import {
  tripPlannerBrandName,
  tripPlannerBrandNameForRegion,
  tripPlannerCnBrandName,
  tripPlannerSiteTitleForRegion,
  tripPlannerWordmark,
} from "./brand.ts";
import { parisPublicItinerary } from "./landing-public-fixture.ts";
import { landingFixtureForRegion } from "./paris-fixture.ts";
import { sichuanPublicItinerary } from "./sichuan-public-fixture.ts";
import { publicItinerarySchema } from "../sharing/schema.ts";

test("landing structured data describes the website and free web app", () => {
  const data = getLandingStructuredData("en", "https://trip-planner.example/path");

  assert.equal(data["@context"], "https://schema.org");
  assert.deepEqual(
    data["@graph"].map((entry) => entry["@type"]),
    ["WebSite", "WebApplication"],
  );
  assert.equal(data["@graph"][0].url, "https://trip-planner.example/");
  assert.equal(data["@graph"][1].isAccessibleForFree, true);
  assert.equal(data["@graph"][1].featureList.length, 4);
  assert.equal(data["@graph"][0].name, "There we go");
  assert.equal(tripPlannerBrandName, "There we go");
  assert.equal(tripPlannerCnBrandName, "ThereWeGo行至");
  assert.equal(tripPlannerBrandNameForRegion("cn"), "ThereWeGo行至");
  assert.equal(tripPlannerBrandNameForRegion("global"), "There we go");
  assert.equal(tripPlannerSiteTitleForRegion("cn"), "ThereWeGo行至 - 协作旅行规划");
  assert.equal(tripPlannerSiteTitleForRegion("global"), "There we go - Collaborative trip planner");
  assert.equal(tripPlannerWordmark, "There we go");
});

test("landing public sample stays compatible with the production share schema", () => {
  assert.equal(publicItinerarySchema.safeParse(parisPublicItinerary).success, true);
  assert.equal(publicItinerarySchema.safeParse(sichuanPublicItinerary).success, true);
  assert.equal(parisPublicItinerary.settings.allowRouteExplore, false);
  assert.equal(sichuanPublicItinerary.settings.allowRouteExplore, false);
  assert.equal(landingFixtureForRegion("global").title, "Paris Trip");
  assert.equal(landingFixtureForRegion("cn").title, "Western Sichuan Loop");
});

test("landing structured data localizes Chinese search copy and escapes markup", () => {
  const data = getLandingStructuredData("zh-CN", "https://trip-planner.example", "cn");

  assert.equal(data["@graph"][0].name, "ThereWeGo行至");
  assert.match(data["@graph"][0].description, /一起规划每一天/);
  assert.deepEqual(data["@graph"][1].featureList, [
    "用行程表直观看全程",
    "按天规划路线",
    "并排比较旅行备选",
    "集中整理旅行资料",
  ]);
  data["@graph"][0].name = "<Trip Planner>";
  assert.doesNotMatch(serializeStructuredData(data), /</);
});

test("regional SEO copy is complete for search and social metadata", () => {
  const global = tripPlannerSeoForRegion("global");
  const cn = tripPlannerSeoForRegion("cn");

  assert.match(global.title, /trip planner/i);
  assert.match(global.description, /shareable itineraries/i);
  assert.match(global.shareImageAlt, /trip planner/i);
  assert.match(cn.title, /旅行规划/);
  assert.match(cn.description, /路线/);
  assert.match(cn.shareImageAlt, /ThereWeGo行至/);
  assert.equal(global.keywords.length, 5);
  assert.equal(cn.keywords.length, 5);
});

test("mobile landing navigation keeps the sign-in action visible", async () => {
  const mobile = await readFile(new URL("./landing-hero-mobile.css", import.meta.url), "utf8");
  assert.match(mobile, /\.nav-sign-in \{[\s\S]*display: inline-flex/);
  assert.doesNotMatch(mobile, /\.plandock-nav \.nav-sign-in \{\s*display: none/);
});
