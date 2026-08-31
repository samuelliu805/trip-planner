import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { getAccountProfileRepository, getAuthProvider } from "@/platform/composition/server";

import { defaultLocale, localeCookieName, parseLocale, type Locale } from "./config";

export type RequestLocaleState = {
  locale: Locale;
  source: "browser" | "default" | "profile";
};

export const getRequestLocaleState = cache(async (): Promise<RequestLocaleState> => {
  const cookieStore = await cookies();
  const browserLocale = parseLocale(cookieStore.get(localeCookieName)?.value);
  if (browserLocale) return { locale: browserLocale, source: "browser" };

  try {
    const user = await getAuthProvider().getCurrentUser();
    if (!user) return { locale: defaultLocale, source: "default" };

    const profile = await getAccountProfileRepository().getForCurrentUser();
    const profileLocale = parseLocale(profile?.preferredLocale);
    return profileLocale
      ? { locale: profileLocale, source: "profile" }
      : { locale: defaultLocale, source: "default" };
  } catch {
    return { locale: defaultLocale, source: "default" };
  }
});

export const getRequestLocale = cache(
  async (): Promise<Locale> => (await getRequestLocaleState()).locale,
);
