import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountEditor } from "@/features/account/components/account-editor";
import { inferredHomeCity } from "@/features/account/profile-defaults";
import { defaultLocaleForRegion, parseLocale } from "@/features/i18n/config";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import { defaultTripCurrencyForRegion } from "@/features/trips/create-defaults";
import { AuthenticatedTelemetryIdentity } from "@/lib/telemetry/authenticated-identity";
import {
  getAccountProfileRepository,
  getAuthProvider,
  getBackendCapabilities,
} from "@/platform/composition/server";
import { getServerProviderConfig } from "@/platform/config/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translateMessage(locale, "Account") };
}

export default async function AccountPage() {
  const requestLocale = await getRequestLocale();
  const user = await getAuthProvider().getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getAccountProfileRepository().getForCurrentUser();
  const appRegion = getServerProviderConfig().appRegion;
  const identity = user.phone ?? user.email ?? String(user.metadata.username ?? "-");
  const identityLabel = user.phone ? "Mobile number" : user.email ? "Email" : "Account";

  return (
    <main className="min-h-dvh bg-muted">
      <AuthenticatedTelemetryIdentity locale={requestLocale} appUserId={user.id} />
      <PlannerMapProvider>
        <AccountEditor
          currency={profile?.defaultCurrency ?? defaultTripCurrencyForRegion(appRegion)}
          email={identity}
          homeCity={profile?.homeCity ?? inferredHomeCity(user.metadata)}
          identityLabel={identityLabel}
          locale={parseLocale(profile?.preferredLocale) ?? defaultLocaleForRegion(appRegion)}
          passwordManagement={getBackendCapabilities().passwordManagement}
        />
      </PlannerMapProvider>
    </main>
  );
}
