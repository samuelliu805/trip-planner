import type { Metadata } from "next";
import { PublicInfoPage } from "@/features/landing/public-info-page";
export const metadata: Metadata = { title: "Privacy | Trip Planner" };
export default function PrivacyPage() {
  return <PublicInfoPage kind="privacy" />;
}
