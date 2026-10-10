"use server";

import { z } from "zod";
import { placeSnapshotSchema } from "@/features/itinerary/item-schema";
import { createResearchItem } from "./actions";
import { classifyIdeaInput, parseReliableIdeaFields } from "./idea-input";
import { fetchIdeaPageMetadata } from "./idea-page-metadata";
import { enrichFlightTimes } from "./idea-page-flight";
import { defaultFlightArrivalDate } from "./journey";
import { defaultJourneyIdeaName } from "./default-name";
import type { ResearchItem, ResearchMutationResult } from "./types";

const captureSchema = z
  .object({
    tripId: z.uuid(),
    operationId: z.uuid(),
    kind: z.enum(["flight", "stay", "car", "train", "activity"]),
    title: z.string().trim().max(300).nullable(),
    sourceUrl: z.url().max(2048).nullable(),
    shareText: z.string().trim().max(5000).nullable(),
    locationText: z.string().trim().max(200).nullable().optional(),
    locationPlaceSnapshot: placeSnapshotSchema.nullable().optional(),
    originPlaceSnapshot: placeSnapshotSchema.nullable().optional(),
    destinationPlaceSnapshot: placeSnapshotSchema.nullable().optional(),
  })
  .refine((value) => value.title || value.sourceUrl, "Add a link or a name.")
  .refine(
    (value) => !value.sourceUrl || /^https?:\/\//i.test(value.sourceUrl),
    "Use an http or https link.",
  );

export async function captureIdea(
  input: z.input<typeof captureSchema>,
): Promise<ResearchMutationResult<ResearchItem>> {
  const resolved = await resolveIdeaCapture(input);
  if (!resolved.data) return { error: resolved.error };
  return createResearchItem(resolved.data);
}

/** Resolve metadata before freezing an outbox payload; retries never resolve it again. */
export async function resolveIdeaCapture(
  input: z.input<typeof captureSchema>,
): Promise<ResearchMutationResult<import("./schema").CreateResearchItemInput>> {
  const parsed = captureSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid idea." };
  const classification = parsed.data.sourceUrl ? classifyIdeaInput(parsed.data.sourceUrl) : null;
  const fields =
    parsed.data.sourceUrl &&
    ["unknown", parsed.data.kind].includes(classification?.kind ?? "unknown")
      ? parseReliableIdeaFields(parsed.data.sourceUrl)
      : parseReliableIdeaFields(null);
  const metadata = parsed.data.sourceUrl
    ? await fetchIdeaPageMetadata(parsed.data.sourceUrl)
    : null;
  const textWithoutUrl = parsed.data.sourceUrl
    ? parsed.data.shareText?.replace(parsed.data.sourceUrl, "").trim() || null
    : parsed.data.shareText;
  const locationText =
    parsed.data.locationPlaceSnapshot?.displayName ??
    parsed.data.locationText ??
    fields.locationText ??
    metadata?.locationText ??
    null;
  const priceAmount = fields.priceAmount ?? metadata?.priceAmount ?? null;
  const priceCurrency = fields.priceCurrency ?? metadata?.priceCurrency ?? null;
  const originPlace = parsed.data.kind === "car" ? (parsed.data.originPlaceSnapshot ?? null) : null;
  const destinationPlace =
    parsed.data.kind === "car"
      ? (parsed.data.destinationPlaceSnapshot ??
        (fields.originText === fields.destinationText ? originPlace : null))
      : null;
  const originText = originPlace?.displayName ?? fields.originText;
  const destinationText = destinationPlace?.displayName ?? fields.destinationText;
  const segments =
    parsed.data.kind === "flight"
      ? (
          enrichFlightTimes(fields.segments, metadata?.segments) ??
          (metadata?.segments?.length === 1 ? metadata.segments : [])
        ).map(defaultFlightArrivalDate)
      : (fields.segments ?? []);
  const journeyName =
    parsed.data.kind === "flight" || parsed.data.kind === "train"
      ? defaultJourneyIdeaName({
          origin: originText,
          destination: destinationText,
          departureDate: fields.startDate,
          journeyType: fields.journeyType,
          segments,
        })
      : null;
  return {
    data: {
      category: parsed.data.kind === "car" ? "rental" : parsed.data.kind,
      currency: priceAmount === null ? null : priceCurrency,
      destinationPlaceSnapshot: destinationPlace,
      destinationText,
      endDate: fields.endDate,
      endTime: fields.endTime ?? null,
      journeyType: fields.journeyType ?? null,
      links: [],
      locationPlaceSnapshot: parsed.data.locationPlaceSnapshot ?? null,
      locationText,
      note:
        textWithoutUrl && textWithoutUrl !== parsed.data.title && textWithoutUrl !== metadata?.title
          ? textWithoutUrl
          : null,
      operationId: parsed.data.operationId,
      originPlaceSnapshot: originPlace,
      originText,
      segments,
      sourceUrl: parsed.data.sourceUrl,
      startDate: fields.startDate,
      startTime: fields.startTime ?? null,
      title:
        parsed.data.title ??
        journeyName ??
        (parsed.data.kind === "car" && classification?.kind === "car"
          ? classification.provider
          : null) ??
        metadata?.title ??
        (originText && destinationText
          ? parsed.data.kind === "car" && originText === destinationText
            ? `Car · ${originText}`
            : `${originText} → ${destinationText}`
          : locationText),
      totalPriceAmount: priceAmount,
      tripId: parsed.data.tripId,
    },
  };
}
