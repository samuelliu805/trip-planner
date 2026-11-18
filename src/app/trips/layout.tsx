import { DraftScopeProvider } from "@/features/editing/draft-scope";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountMenu } from "@/components/navigation/account-menu";
import { AuthenticatedGuestStorageCleanup } from "@/features/guest/components/authenticated-guest-storage-cleanup";
import { getRequestLocale } from "@/features/i18n/server";
import { AuthenticatedTelemetryIdentity } from "@/lib/telemetry/authenticated-identity";
import { getAuthProvider } from "@/platform/composition/server";
import { appUserIdentityLabel } from "@/platform/contracts/auth";
import { tripPlannerWordmark } from "@/features/landing/brand";

export const metadata: Metadata = {
  robots: { follow: false, index: false, noarchive: true },
};

export default async function TripsLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthProvider().getCurrentUser();
  if (!user) redirect("/login");
  const locale = await getRequestLocale();

  return (
    <DraftScopeProvider actorId={user.id}>
      <div className="trips-shell min-h-dvh bg-background">
        <AuthenticatedGuestStorageCleanup />
        <AuthenticatedTelemetryIdentity appUserId={user.id} locale={locale} />
        <header className="trips-global-header sticky top-0 z-[80] border-b bg-card/95 backdrop-blur">
          <div className="flex h-14 w-full items-center justify-between px-4 sm:h-16 lg:px-5">
            <Link className="font-semibold tracking-tight" href="/trips">
              {tripPlannerWordmark}
            </Link>
            <AccountMenu identityLabel={appUserIdentityLabel(user)} />
          </div>
        </header>
        {children}
      </div>
    </DraftScopeProvider>
  );
}
