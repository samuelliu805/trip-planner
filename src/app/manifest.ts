import type { MetadataRoute } from "next";

import { tripPlannerSeoForRegion } from "@/features/landing/seo";
import { getServerProviderConfig } from "@/platform/config/server";

export default function manifest(): MetadataRoute.Manifest {
  const seo = tripPlannerSeoForRegion(getServerProviderConfig().appRegion);

  return {
    background_color: "#fbfaf6",
    description: seo.description,
    display: "standalone",
    icons: [{ sizes: "any", src: "/icon.svg", type: "image/svg+xml" }],
    name: seo.title,
    short_name: seo.name,
    start_url: "/",
    theme_color: "#132238",
  };
}
