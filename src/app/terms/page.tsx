import type { Metadata } from "next";

import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { PublicInfoPage } from "@/features/landing/public-info-page";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    alternates: { canonical: "/terms" },
    description: translateMessage(locale, "There we go helps you organize a plan."),
    title: translateMessage(locale, "Terms"),
  };
}

export default function TermsPage() {
  return <PublicInfoPage kind="terms" />;
}
