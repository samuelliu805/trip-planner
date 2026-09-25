import { classifyIdeaInput, parseReliableIdeaFields } from "../research/idea-input.ts";
import type { ResearchCategory } from "../research/types.ts";

export function guestQuickIdeaInput(text: string, category: ResearchCategory, tripId: string) {
  const classification = classifyIdeaInput(text);
  if (classification.error) throw new Error(classification.error);
  const sourceUrl = classification.sourceUrl;
  const parsed = parseReliableIdeaFields(sourceUrl);
  const detectedCategory: ResearchCategory =
    classification.kind === "car"
      ? "rental"
      : classification.kind === "unknown"
        ? category
        : classification.kind;
  const titleText = sourceUrl ? text.replace(sourceUrl, "").trim() : text;
  const route =
    parsed.originText && parsed.destinationText
      ? `${parsed.originText} → ${parsed.destinationText}`
      : null;
  const title = titleText || route || (sourceUrl ? new URL(sourceUrl).hostname : text);
  return {
    category: detectedCategory,
    input: {
      category: detectedCategory,
      currency: parsed.priceAmount === undefined ? null : (parsed.priceCurrency ?? null),
      destinationText: parsed.destinationText,
      endDate: parsed.endDate,
      endTime: parsed.endTime ?? null,
      journeyType: parsed.journeyType ?? null,
      links: [],
      locationText: parsed.locationText,
      note: null,
      operationId: crypto.randomUUID(),
      originText: parsed.originText,
      segments: parsed.segments ?? [],
      sourceUrl,
      startDate: parsed.startDate,
      startTime: parsed.startTime ?? null,
      title: title.slice(0, 300),
      totalPriceAmount: parsed.priceAmount ?? null,
      tripId,
    },
  };
}
