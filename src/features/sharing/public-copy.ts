import type { Locale } from "@/features/i18n/config";

export function publicItineraryDescription(
  locale: Locale,
  dayCount: number,
  localitySummary?: string,
) {
  const locality = localitySummary ? ` · ${localitySummary}` : "";
  if (locale === "zh-CN") return `${dayCount} 天行程${locality} · 查看计划、票券和路线`;
  return `${dayCount}-day itinerary${locality} · View plans, tickets and routes`;
}

export function localizeGeneratedPublicDescription(description: string, locale: Locale) {
  if (locale === "en") return description;
  const match = description.match(
    /^(\d+)-day itinerary(?: · (.*?))? · View plans, tickets and routes$/,
  );
  if (!match) return description;
  return publicItineraryDescription(locale, Number(match[1]), match[2]);
}
