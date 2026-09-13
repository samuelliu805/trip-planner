import type { Metadata } from "next";
import { PublicInfoPage } from "@/features/landing/public-info-page";
export const metadata: Metadata = { title: "Support | There We Go" };
export default function SupportPage() {
  return <PublicInfoPage kind="support" />;
}
