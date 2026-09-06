import type { Metadata } from "next";
import { PublicInfoPage } from "@/features/landing/public-info-page";
export const metadata: Metadata = { title: "Terms | Plandock" };
export default function TermsPage() {
  return <PublicInfoPage kind="terms" />;
}
