import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getLandingStructuredData, serializeStructuredData } from "./seo.ts";
import { tripPlannerBrandName, tripPlannerWordmark } from "./brand.ts";
import { parisPublicItinerary } from "./landing-public-fixture.ts";
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
  assert.equal(data["@graph"][0].name, "There We Go");
  assert.equal(tripPlannerBrandName, "There We Go");
  assert.equal(tripPlannerWordmark, "there we go");
});

test("landing public sample stays compatible with the production share schema", () => {
  assert.equal(publicItinerarySchema.safeParse(parisPublicItinerary).success, true);
  assert.equal(parisPublicItinerary.settings.allowRouteExplore, false);
});

test("landing structured data localizes Chinese search copy and escapes markup", () => {
  const data = getLandingStructuredData("zh-CN", "https://trip-planner.example");

  assert.match(data["@graph"][0].description, /每天的行程/);
  assert.deepEqual(data["@graph"][1].featureList, [
    "用行程表直观看全程",
    "按天规划路线",
    "并排比较旅行备选",
    "集中整理旅行资料",
  ]);
  data["@graph"][0].name = "<Trip Planner>";
  assert.doesNotMatch(serializeStructuredData(data), /</);
});

test("mobile landing navigation keeps the sign-in action visible", async () => {
  const mobile = await readFile(new URL("./landing-hero-mobile.css", import.meta.url), "utf8");
  assert.match(mobile, /\.nav-sign-in \{[\s\S]*display: inline-flex/);
  assert.doesNotMatch(mobile, /\.plandock-nav \.nav-sign-in \{\s*display: none/);
});
