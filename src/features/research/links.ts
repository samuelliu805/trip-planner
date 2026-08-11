import type { Json } from "@/types/database";

import type { ResearchLink } from "./types.ts";

export function parseResearchLinks(value: Json | undefined): ResearchLink[] {
  if (!Array.isArray(value)) return [];
  const links: ResearchLink[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
    if (!label || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    links.push({ label: label.slice(0, 80), url: url.slice(0, 2048) });
    seen.add(url);
  }
  return links;
}

export function researchLinksWithSource(value: Json | undefined, sourceUrl: string | null) {
  const links = parseResearchLinks(value);
  if (sourceUrl && !links.some(({ url }) => url === sourceUrl))
    links.unshift({ label: "Booking", url: sourceUrl });
  return links;
}
