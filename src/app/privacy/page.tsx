import type { Metadata } from "next";
import { PublicInfoPage } from "@/features/landing/public-info-page";
export const metadata: Metadata = { title: "Privacy | There We Go" };
export default function PrivacyPage() {
  return <PublicInfoPage kind="privacy" />;
}
