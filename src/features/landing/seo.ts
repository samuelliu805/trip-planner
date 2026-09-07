import type { Locale } from "../i18n/config.ts";
import { translateMessage } from "../i18n/translate.ts";

import { tripPlannerBrandName } from "./brand.ts";

export const landingDescriptionMessage =
  "Build the route, compare options, keep travel documents close, and share one usable trip plan.";

const featureMessages = [
  "Visual itinerary planning",
  "Day-by-day route planning",
  "Travel option comparison",
  "Travel document organization",
] as const;

export function getLandingStructuredData(locale: Locale, siteUrl: string) {
  const url = new URL("/", siteUrl).href;
  const description = translateMessage(locale, landingDescriptionMessage);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": `${url}#website`,
        "@type": "WebSite",
        description,
        inLanguage: locale,
        name: tripPlannerBrandName,
        url,
      },
      {
        "@id": `${url}#web-app`,
        "@type": "WebApplication",
        applicationCategory: "TravelApplication",
        description,
        featureList: featureMessages.map((message) => translateMessage(locale, message)),
        inLanguage: locale,
        isAccessibleForFree: true,
        name: tripPlannerBrandName,
        operatingSystem: "Any",
        url,
      },
    ],
  };
}

export function serializeStructuredData(value: ReturnType<typeof getLandingStructuredData>) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
