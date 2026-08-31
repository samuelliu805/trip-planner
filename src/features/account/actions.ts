"use server";

import { revalidatePath } from "next/cache";

import { updateAccountSchema } from "@/features/account/schema";
import type { AccountActionState } from "@/features/account/types";
import { getAccountProfileRepository, getAuthProvider } from "@/platform/composition/server";

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

  const user = await getAuthProvider().getCurrentUser();
  if (!user) return { error: "Sign in to update your account." };

  try {
    await getAccountProfileRepository().saveForCurrentUser({
      defaultCurrency: parsed.data.currency,
      homeCity: parsed.data.homeCity || null,
      preferredLocale: parsed.data.locale,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save your preferences." };
  }
  revalidatePath("/account");
  return { success: "Account preferences saved." };
}
