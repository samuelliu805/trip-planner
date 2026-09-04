export const tripCurrencyCodes = [
  "USD",
  "EUR",
  "GBP",
  "CNY",
  "HKD",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "INR",
  "KRW",
] as const;

export type TripCurrencyCode = (typeof tripCurrencyCodes)[number];

const currencyNames: Record<"en" | "zh-CN", Record<TripCurrencyCode, string>> = {
  en: {
    AUD: "Australian dollar",
    CAD: "Canadian dollar",
    CHF: "Swiss franc",
    CNY: "Chinese yuan",
    EUR: "Euro",
    GBP: "British pound",
    HKD: "Hong Kong dollar",
    INR: "Indian rupee",
    JPY: "Japanese yen",
    KRW: "South Korean won",
    USD: "US dollar",
  },
  "zh-CN": {
    AUD: "澳大利亚元",
    CAD: "加拿大元",
    CHF: "瑞士法郎",
    CNY: "人民币",
    EUR: "欧元",
    GBP: "英镑",
    HKD: "港币",
    INR: "印度卢比",
    JPY: "日元",
    KRW: "韩元",
    USD: "美元",
  },
};

export function tripCurrencyCodesForLocale(locale: "en" | "zh-CN") {
  if (locale !== "zh-CN") return tripCurrencyCodes;
  return ["CNY", ...tripCurrencyCodes.filter((code) => code !== "CNY")] as const;
}

export function tripCurrencyLabel(code: string, locale: "en" | "zh-CN") {
  const name = currencyNames[locale][code as TripCurrencyCode];
  return name ? `${code} · ${name}` : code;
}
