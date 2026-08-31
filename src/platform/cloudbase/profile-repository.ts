import "server-only";

import type {
  AccountProfile,
  AccountProfileRepository,
  UpdateAccountProfileInput,
} from "@/platform/contracts/profile";

import { createCloudBaseUserContext } from "./database";
import { cloudBaseData } from "./errors";

function profile(value: unknown): AccountProfile | null {
  if (!Array.isArray(value) || !value.length) return null;
  const row = value[0] as Record<string, unknown>;
  if (typeof row.default_currency !== "string") return null;
  return Object.freeze({
    defaultCurrency: row.default_currency,
    homeCity: typeof row.home_city === "string" ? row.home_city : null,
    preferredLocale: typeof row.preferred_locale === "string" ? row.preferred_locale : null,
  });
}

export class CloudBaseAccountProfileRepository implements AccountProfileRepository {
  async getForCurrentUser() {
    const { db, user } = await createCloudBaseUserContext();
    const result = await db
      .from("profiles")
      .select("default_currency, home_city, preferred_locale")
      .eq("id", user.id);
    return profile(cloudBaseData(await result, "Account preferences could not be loaded."));
  }

  async saveForCurrentUser(input: UpdateAccountProfileInput) {
    const { db, user } = await createCloudBaseUserContext();
    const current = await this.getForCurrentUser();
    const values = {
      default_currency: input.defaultCurrency,
      home_city: input.homeCity,
      preferred_locale: input.preferredLocale,
    };
    const query = current
      ? db.from("profiles").update(values).eq("id", user.id)
      : db.from("profiles").insert({ id: user.id, ...values });
    cloudBaseData(await query, "Account preferences could not be saved.");
    return Object.freeze({
      defaultCurrency: input.defaultCurrency,
      homeCity: input.homeCity,
      preferredLocale: input.preferredLocale,
    });
  }
}
