import type { Locale } from "@/features/i18n/config";

import { TelemetryIdentityBridge } from "./identity-bridge";
import { authenticatedAnalyticsId } from "./identity.server";

export function AuthenticatedTelemetryIdentity({
  locale,
  appUserId,
}: {
  locale: Locale;
  appUserId: string;
}) {
  const analyticsId = authenticatedAnalyticsId(appUserId);
  return analyticsId ? <TelemetryIdentityBridge analyticsId={analyticsId} locale={locale} /> : null;
}
