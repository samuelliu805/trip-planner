import "server-only";

import type {
  AccountProfileRepository,
  UpdateAccountProfileInput,
} from "@/platform/contracts/profile";
import { PlatformOperationError } from "@/platform/contracts/errors";

import { createSupabaseServerClient } from "./server";

export class SupabaseAccountProfileRepository implements AccountProfileRepository {
  async getForCurrentUser() {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      throw new PlatformOperationError("authentication_required", "Authentication is required.");
    const { data, error } = await supabase
      .from("profiles")
      .select("default_currency, home_city, preferred_locale")
      .eq("id", user.id)
      .maybeSingle();
    if (error)
      throw new PlatformOperationError("unexpected", "Account preferences could not be loaded.", {
        cause: error,
      });
    return data
      ? Object.freeze({
          defaultCurrency: data.default_currency,
          homeCity: data.home_city,
          preferredLocale: data.preferred_locale,
        })
      : null;
  }

  async saveForCurrentUser(input: UpdateAccountProfileInput) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      throw new PlatformOperationError("authentication_required", "Authentication is required.");
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          default_currency: input.defaultCurrency,
          home_city: input.homeCity,
          id: user.id,
          preferred_locale: input.preferredLocale,
        },
        { onConflict: "id" },
      )
      .select("default_currency, home_city, preferred_locale")
      .maybeSingle();
    if (error || !data)
      throw new PlatformOperationError("unexpected", "Account preferences could not be saved.", {
        cause: error,
      });
    return Object.freeze({
      defaultCurrency: data.default_currency,
      homeCity: data.home_city,
      preferredLocale: data.preferred_locale,
    });
  }
}
