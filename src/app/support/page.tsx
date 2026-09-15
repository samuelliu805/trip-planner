import type { Metadata } from "next";

import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { PublicInfoPage } from "@/features/landing/public-info-page";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    alternates: { canonical: "/support" },
    description: translateMessage(locale, "Need a hand with your plan?"),
    title: translateMessage(locale, "Support"),
  };
}

export default function SupportPage() {
  return <PublicInfoPage kind="support" />;
}
