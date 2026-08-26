import type { Locale } from "./config.ts";
import { zhCNMessages } from "./messages/index.ts";

export type TranslationValues = Record<string, number | string>;

function interpolate(message: string, values?: TranslationValues) {
  if (!values) return message;
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function translateMessage(locale: Locale, message: string, values?: TranslationValues) {
  const key = message.trim();
  const translated =
    locale === "zh-CN" ? (zhCNMessages[message] ?? zhCNMessages[key] ?? key) : message;
  return interpolate(translated, values);
}

export function hasChineseTranslation(message: string) {
  return Boolean(zhCNMessages[message]);
}
