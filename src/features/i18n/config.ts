export const supportedLocales = ["en", "zh-CN"] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "en";
export const localeCookieName = "trip-planner-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && supportedLocales.includes(value as Locale);
}

export function normalizeLocale(value: unknown): Locale {
  if (isLocale(value)) return value;
  if (typeof value === "string" && value.toLowerCase().startsWith("zh")) return "zh-CN";
  return defaultLocale;
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "zh-CN" : "en";
}
