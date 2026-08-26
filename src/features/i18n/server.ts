import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { locale: defaultLocale, source: "default" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_locale")
      .eq("id", user.id)
      .maybeSingle();
    const profileLocale = parseLocale(profile?.preferred_locale);
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
