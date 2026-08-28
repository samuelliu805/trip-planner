import type { Locale } from "@/features/i18n/config";

import { TelemetryIdentityBridge } from "./identity-bridge";
import { authenticatedAnalyticsId } from "./identity.server";

export function AuthenticatedTelemetryIdentity({
  locale,
  supabaseUserId,
}: {
  locale: Locale;
  supabaseUserId: string;
}) {
  const analyticsId = authenticatedAnalyticsId(supabaseUserId);
  return analyticsId ? <TelemetryIdentityBridge analyticsId={analyticsId} locale={locale} /> : null;
}
