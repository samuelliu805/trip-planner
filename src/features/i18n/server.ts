import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { defaultLocale, localeCookieName, normalizeLocale, type Locale } from "./config";

export const getRequestLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const cookieLocale = normalizeLocale(cookieStore.get(localeCookieName)?.value);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return cookieLocale;

    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_locale")
      .eq("id", user.id)
      .maybeSingle();
    return normalizeLocale(profile?.preferred_locale ?? cookieLocale);
  } catch {
    return cookieLocale ?? defaultLocale;
  }
});
