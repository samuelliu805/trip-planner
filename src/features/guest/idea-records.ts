import { createResearchItemSchema, type CreateResearchItemInput } from "../research/schema.ts";
import type { ResearchItem } from "../research/types.ts";
import type { GuestIdea, GuestTripDraft } from "./schema.ts";

export function appliedGuestIdeaId(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const id = (details as Record<string, unknown>).ideaResearchItemId;
  return typeof id === "string" ? id : null;
}

export function researchItemFromGuestIdea(idea: GuestIdea): ResearchItem {
  const value = idea.values;
  return {
    id: idea.id,
    trip_id: value.tripId,
    category: value.category,
    title: value.title ?? null,
    note: value.note ?? null,
    source_url: value.sourceUrl ?? null,
    total_price_amount: value.totalPriceAmount ?? null,
    currency: value.currency ?? null,
    origin_text: value.originText ?? null,
    destination_text: value.destinationText ?? null,
    location_text: value.locationText ?? null,
    origin_place_id: value.originPlaceId ?? null,
    destination_place_id: value.destinationPlaceId ?? null,
    location_place_id: value.locationPlaceId ?? null,
    origin_place: null,
    destination_place: null,
    location_place: null,
    start_date: value.startDate ?? null,
    end_date: value.endDate ?? null,
    start_time: value.startTime ?? null,
    end_time: value.endTime ?? null,
    journey_type: value.journeyType ?? null,
    segments: value.segments,
    links: value.links,
    adult_count: value.adultCount ?? null,
    child_count: value.childCount ?? null,
    room_count: value.roomCount ?? null,
    day_id: value.dayId ?? null,
    itinerary_item_id: value.itemId ?? null,
    observed_at: idea.createdAt,
    created_at: idea.createdAt,
    updated_at: idea.createdAt,
    version: 1,
    attachments: [],
  } as unknown as ResearchItem;
}

export function saveGuestIdea(
  draft: GuestTripDraft,
  input: CreateResearchItemInput,
  existingId?: string,
  createId: () => string = () => crypto.randomUUID(),
  now = new Date(),
): { draft: GuestTripDraft; idea: GuestIdea } {
  const previous = existingId ? draft.ideas.find(({ id }) => id === existingId) : undefined;
  if (existingId && !previous) throw new Error("The local idea no longer exists.");
  if (!previous && draft.ideas.length >= 100) throw new Error("A local trip can hold 100 ideas.");
  const id = previous?.id ?? createId();
  const values = createResearchItemSchema.parse({
    ...input,
    operationId: id,
    tripId: draft.draftId,
  });
  const idea: GuestIdea = { id, createdAt: previous?.createdAt ?? now.toISOString(), values };
  return {
    draft: {
      ...draft,
      ideas: [idea, ...draft.ideas.filter((entry) => entry.id !== id)],
    },
    idea,
  };
}

export function removeGuestIdea(draft: GuestTripDraft, id: string) {
  return { ...draft, ideas: draft.ideas.filter((idea) => idea.id !== id) };
}
