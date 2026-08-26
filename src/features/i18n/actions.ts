"use server";

import { isLocale, type Locale } from "./config";
import { setLocaleCookie } from "./server-cookie";

export async function persistLocale(locale: Locale) {
  if (!isLocale(locale)) return;

  await setLocaleCookie(locale);
}
