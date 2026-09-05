import type { Metadata } from "next";

import { GuestPlanner } from "@/features/guest/components/guest-planner";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getAuthProvider } from "@/platform/composition/server";
import { getServerProviderConfig } from "@/platform/config/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translateMessage(locale, "Local trip") };
}

export default async function GuestTripPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string }>;
}) {
  const [{ claim }, user] = await Promise.all([searchParams, getAuthProvider().getCurrentUser()]);
  return (
    <GuestPlanner
      authenticated={Boolean(user)}
      claimMode={claim === "1" ? "claim" : claim === "prompt" ? "prompt" : undefined}
      region={getServerProviderConfig().appRegion}
    />
  );
}
