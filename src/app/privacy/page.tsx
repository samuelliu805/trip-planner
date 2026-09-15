import type { Metadata } from "next";

import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { PublicInfoPage } from "@/features/landing/public-info-page";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    alternates: { canonical: "/privacy" },
    description: translateMessage(locale, "Your trip information should stay understandable."),
    title: translateMessage(locale, "Privacy"),
  };
}

export default function PrivacyPage() {
  return <PublicInfoPage kind="privacy" />;
}
