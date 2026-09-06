import type { Metadata } from "next";

import { LandingPage } from "@/features/landing/landing-page";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const description = translateMessage(
    locale,
    "Build the route, compare options, keep travel documents close, and share one usable trip plan.",
  );
  return {
    title: { absolute: "Plandock" },
    description,
    icons: { icon: "/icon.svg" },
    openGraph: {
      description,
      images: [{ alt: "Plandock route dock", height: 630, url: "/opengraph-image", width: 1200 }],
      locale: locale === "zh-CN" ? "zh_CN" : "en_US",
      siteName: "Plandock",
      title: "Plandock",
      type: "website",
      url: "/",
    },
    twitter: {
      card: "summary_large_image",
      description,
      images: ["/opengraph-image"],
      title: "Plandock",
    },
  };
}

export default function Home() {
  return <LandingPage year={new Date().getFullYear()} />;
}
