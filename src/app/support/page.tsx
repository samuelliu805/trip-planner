import type { Metadata } from "next";
import { PublicInfoPage } from "@/features/landing/public-info-page";
export const metadata: Metadata = { title: "Support | Trip Planner" };
export default function SupportPage() {
  return <PublicInfoPage kind="support" />;
}
