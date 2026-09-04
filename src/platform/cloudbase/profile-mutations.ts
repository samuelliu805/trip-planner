import type { AccountProfile, UpdateAccountProfileInput } from "../contracts/profile.ts";
import { PlatformOperationError } from "../contracts/errors.ts";
import type { CloudBaseDatabase } from "./client.ts";
import { cloudBaseData } from "./errors.ts";

export async function saveCloudBaseProfile(
  db: CloudBaseDatabase,
  userId: string,
  input: UpdateAccountProfileInput,
): Promise<AccountProfile> {
  const result = await db
    .from("profiles")
    .upsert(
      {
        default_currency: input.defaultCurrency,
        default_currency_is_explicit: true,
        home_city: input.homeCity,
        id: userId,
        preferred_locale: input.preferredLocale,
      },
      { onConflict: "id" },
    )
    .select("default_currency, default_currency_is_explicit, home_city, id, preferred_locale");
  const rows = cloudBaseData(result, "Account preferences could not be saved.");
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new PlatformOperationError(
      "unexpected",
      "The account preference update was not confirmed.",
    );
  }
  const row = rows[0] as Record<string, unknown>;
  if (
    row.id !== userId ||
    typeof row.default_currency !== "string" ||
    row.default_currency_is_explicit !== true ||
    (row.home_city !== null && typeof row.home_city !== "string") ||
    typeof row.preferred_locale !== "string"
  ) {
    throw new PlatformOperationError(
      "unexpected",
      "The account preference update returned invalid data.",
    );
  }
  return Object.freeze({
    defaultCurrency: row.default_currency,
    homeCity: row.home_city,
    preferredLocale: row.preferred_locale,
  });
}
