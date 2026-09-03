export const supportedLocales = ["en", "zh-CN"] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "en";
export const localeCookieName = "trip-planner-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && supportedLocales.includes(value as Locale);
}

export function parseLocale(value: unknown): Locale | null {
  if (isLocale(value)) return value;
  if (typeof value === "string" && value.toLowerCase().startsWith("zh")) return "zh-CN";
  return null;
}

export function normalizeLocale(value: unknown): Locale {
  return parseLocale(value) ?? defaultLocale;
}

export function defaultLocaleForRegion(region: "cn" | "global"): Locale {
  return region === "cn" ? "zh-CN" : "en";
}

export type RequestLocaleState = {
  locale: Locale;
  source: "browser" | "profile" | "regional_default";
};

export function resolveLocaleState(input: {
  appRegion: "cn" | "global";
  browserLocale?: unknown;
  profileLocale?: unknown;
}): RequestLocaleState {
  const browserLocale = parseLocale(input.browserLocale);
  if (browserLocale) return { locale: browserLocale, source: "browser" };
  const profileLocale = parseLocale(input.profileLocale);
  if (profileLocale) return { locale: profileLocale, source: "profile" };
  return { locale: defaultLocaleForRegion(input.appRegion), source: "regional_default" };
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "zh-CN" : "en";
}
