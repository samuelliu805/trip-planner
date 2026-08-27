import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountEditor } from "@/features/account/components/account-editor";
import { inferredHomeCity } from "@/features/account/profile-defaults";
import { normalizeLocale } from "@/features/i18n/config";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import { defaultTripCurrency } from "@/features/trips/create-defaults";
import { createClient } from "@/lib/supabase/server";
import { AuthenticatedTelemetryIdentity } from "@/lib/telemetry/authenticated-identity";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translateMessage(locale, "Account") };
}

export default async function AccountPage() {
  const requestLocale = await getRequestLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_currency, home_city, preferred_locale")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="min-h-dvh bg-muted">
      <AuthenticatedTelemetryIdentity locale={requestLocale} supabaseUserId={user.id} />
      <PlannerMapProvider>
        <AccountEditor
          currency={profile?.default_currency ?? defaultTripCurrency}
          email={user.email ?? translateMessage(requestLocale, "Email unavailable")}
          homeCity={profile?.home_city ?? inferredHomeCity(user.user_metadata)}
          locale={normalizeLocale(profile?.preferred_locale)}
        />
      </PlannerMapProvider>
    </main>
  );
}
