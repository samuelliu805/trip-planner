import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountEditor } from "@/features/account/components/account-editor";
import { inferredHomeCity } from "@/features/account/profile-defaults";
import { normalizeLocale } from "@/features/i18n/config";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import { defaultTripCurrency } from "@/features/trips/create-defaults";
import { AuthenticatedTelemetryIdentity } from "@/lib/telemetry/authenticated-identity";
import { getAccountProfileRepository, getAuthProvider } from "@/platform/composition/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translateMessage(locale, "Account") };
}

export default async function AccountPage() {
  const requestLocale = await getRequestLocale();
  const user = await getAuthProvider().getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getAccountProfileRepository().getForCurrentUser();

  return (
    <main className="min-h-dvh bg-muted">
      <AuthenticatedTelemetryIdentity locale={requestLocale} appUserId={user.id} />
      <PlannerMapProvider>
        <AccountEditor
          currency={profile?.defaultCurrency ?? defaultTripCurrency}
          email={
            user.email ??
            String(user.metadata.username ?? translateMessage(requestLocale, "Email unavailable"))
          }
          homeCity={profile?.homeCity ?? inferredHomeCity(user.metadata)}
          locale={normalizeLocale(profile?.preferredLocale)}
        />
      </PlannerMapProvider>
    </main>
  );
}
