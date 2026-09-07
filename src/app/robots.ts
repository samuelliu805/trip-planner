import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/features/sharing/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    host: siteUrl,
    rules: {
      allow: "/",
      disallow: ["/api/", "/auth/"],
      userAgent: "*",
    },
    sitemap: new URL("/sitemap.xml", siteUrl).href,
  };
}
