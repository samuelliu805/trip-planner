"use server";

import { createClient } from "@/lib/supabase/server";

import { isLocale, type Locale } from "./config";
import { setLocaleCookie } from "./server-cookie";

export async function persistLocale(locale: Locale) {
  if (!isLocale(locale)) return;

  await setLocaleCookie(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profiles").upsert(
    {
      id: user.id,
      preferred_locale: locale,
    },
    { onConflict: "id" },
  );
}
