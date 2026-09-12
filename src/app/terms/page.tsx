import type { Metadata } from "next";
import { PublicInfoPage } from "@/features/landing/public-info-page";
export const metadata: Metadata = { title: "Terms | There We Go" };
export default function TermsPage() {
  return <PublicInfoPage kind="terms" />;
}
