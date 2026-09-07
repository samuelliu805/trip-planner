import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/features/sharing/site-url";

const publicRoutes = ["/", "/privacy", "/terms", "/support"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();

  return publicRoutes.map((path) => ({
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.4,
    url: new URL(path, siteUrl).href,
  }));
}
