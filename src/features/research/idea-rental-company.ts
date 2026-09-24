import { classifyIdeaInput } from "./idea-input.ts";
import type { ResearchItem } from "./types.ts";

export function inferredRentalCompany(
  item: Pick<
    ResearchItem,
    "category" | "destination_text" | "origin_text" | "source_url" | "title"
  >,
) {
  if (item.category !== "rental" || !item.source_url) return null;
  const classification = classifyIdeaInput(item.source_url);
  if (classification.kind !== "car" || !classification.provider) return null;
  const title = item.title?.trim() ?? "";
  const origin = item.origin_text;
  const destination = item.destination_text;
  const generated = origin && destination ? `${origin} → ${destination}` : null;
  return !title ||
    title === generated ||
    (origin && ["Car", "租车"].some((label) => title === `${label} · ${origin}`))
    ? classification.provider
    : null;
}
