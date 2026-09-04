"use server";

import { revalidatePath } from "next/cache";

import { changePasswordSchema, updateAccountSchema } from "@/features/account/schema";
import type { AccountActionState } from "@/features/account/types";
import { PlatformOperationError } from "@/platform/contracts/errors";
import {
  getAccountProfileRepository,
  getAuthProvider,
  getBackendCapabilities,
  getPasswordManagementProvider,
} from "@/platform/composition/server";

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

export async function changeAccountPassword(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  if (!getBackendCapabilities().passwordManagement)
    return { error: "Password changes are not available." };
  const parsed = changePasswordSchema.safeParse({
    confirmation: formData.get("password_confirmation"),
    currentPassword: formData.get("current_password"),
    newPassword: formData.get("new_password"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  if (!(await getAuthProvider().getCurrentUser()))
    return { error: "Sign in to update your account." };
  try {
    await getPasswordManagementProvider().changePassword(parsed.data);
  } catch (error) {
    if (error instanceof PlatformOperationError) {
      if (error.code === "invalid_credentials") return { error: "Current password is incorrect." };
      return { error: error.message };
    }
    return { error: "Password could not be changed." };
  }
  return { success: "Password changed." };
}
