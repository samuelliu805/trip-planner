import type { Locale } from "../i18n/config.ts";
import { translateMessage } from "../i18n/translate.ts";

import { tripPlannerBrandNameForRegion, tripPlannerSiteTitleForRegion } from "./brand.ts";

export const tripPlannerSeoByRegion = Object.freeze({
  cn: Object.freeze({
    description:
      "一起规划每一天、每段路线与每个旅行选择，把住宿、预订、票据和分享整理在同一份行程中。",
    keywords: ["旅行规划", "行程规划", "协作行程", "路线规划", "旅行分享"],
    shareImageAlt: "ThereWeGo行至协作旅行规划预览",
    slogan: "一起规划，带着清晰可用的行程出发。",
  }),
  global: Object.freeze({
    description:
      "Plan days, routes, stays, options, bookings, and shareable itineraries together in one collaborative trip planner.",
    keywords: [
      "trip planner",
      "collaborative trip planning",
      "travel itinerary planner",
      "route planner",
      "shareable itinerary",
    ],
    shareImageAlt: "There we go collaborative trip planner preview",
    slogan: "Plan together. Know what’s next before you go.",
  }),
});

export function tripPlannerSeoForRegion(region: "cn" | "global") {
  return {
    ...tripPlannerSeoByRegion[region],
    name: tripPlannerBrandNameForRegion(region),
    title: tripPlannerSiteTitleForRegion(region),
  };
}

const featureMessages = [
  "Visual itinerary planning",
  "Day-by-day route planning",
  "Travel option comparison",
  "Travel document organization",
] as const;

export function getLandingStructuredData(
  locale: Locale,
  siteUrl: string,
  region: "cn" | "global" = "global",
) {
  const url = new URL("/", siteUrl).href;
  const seo = tripPlannerSeoForRegion(region);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": `${url}#website`,
        "@type": "WebSite",
        description: seo.description,
        inLanguage: locale,
        name: seo.name,
        url,
      },
      {
        "@id": `${url}#web-app`,
        "@type": "WebApplication",
        applicationCategory: "TravelApplication",
        description: seo.description,
        featureList: featureMessages.map((message) => translateMessage(locale, message)),
        inLanguage: locale,
        isAccessibleForFree: true,
        name: seo.name,
        operatingSystem: "Any",
        slogan: seo.slogan,
        url,
      },
    ],
  };
}

export function serializeStructuredData(value: ReturnType<typeof getLandingStructuredData>) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
