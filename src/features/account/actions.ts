"use server";

import { revalidatePath } from "next/cache";

import { updateAccountSchema } from "@/features/account/schema";
import type { AccountActionState } from "@/features/account/types";
import { setLocaleCookie } from "@/features/i18n/server-cookie";
import { createClient } from "@/lib/supabase/server";

export async function updateAccount(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const parsed = updateAccountSchema.safeParse({
    currency: formData.get("currency"),
    homeCity: formData.get("home_city"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to update your account." };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        default_currency: parsed.data.currency,
        home_city: parsed.data.homeCity || null,
        id: user.id,
        preferred_locale: parsed.data.locale,
      },
      { onConflict: "id" },
    )
    .select("default_currency, preferred_locale")
    .maybeSingle();

  if (error || !data) return { error: error?.message ?? "Could not save your preferences." };
  await setLocaleCookie(parsed.data.locale);
  revalidatePath("/account");
  return { success: "Account preferences saved." };
}
