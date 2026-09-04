import "server-only";

import type {
  AccountProfile,
  AccountProfileRepository,
  UpdateAccountProfileInput,
} from "@/platform/contracts/profile";

import { createCloudBaseUserContext } from "./database";
import { cloudBaseData } from "./errors";
import { cloudBaseCnDefaultCurrency, explicitCloudBaseCurrency } from "./profile-currency";
import { saveCloudBaseProfile } from "./profile-mutations";

function profile(value: unknown): AccountProfile | null {
  if (!Array.isArray(value) || !value.length) return null;
  const row = value[0] as Record<string, unknown>;
  if (typeof row.default_currency !== "string") return null;
  return Object.freeze({
    defaultCurrency:
      explicitCloudBaseCurrency(row.default_currency, row.default_currency_is_explicit) ??
      cloudBaseCnDefaultCurrency,
    homeCity: typeof row.home_city === "string" ? row.home_city : null,
    preferredLocale: typeof row.preferred_locale === "string" ? row.preferred_locale : null,
  });
}

export class CloudBaseAccountProfileRepository implements AccountProfileRepository {
  async getForCurrentUser() {
    const { db, user } = await createCloudBaseUserContext();
    const result = await db
      .from("profiles")
      .select("default_currency, default_currency_is_explicit, home_city, preferred_locale")
      .eq("id", user.id);
    return profile(cloudBaseData(await result, "Account preferences could not be loaded."));
  }

  async saveForCurrentUser(input: UpdateAccountProfileInput) {
    const { db, user } = await createCloudBaseUserContext();
    return saveCloudBaseProfile(db, user.id, input);
  }
}
