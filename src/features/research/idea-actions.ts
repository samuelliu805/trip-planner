"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAuthProvider, getRelationalDatabase } from "@/platform/composition/server";
import type { Json } from "@/types/database";

import { loadResearchItem } from "./actions";
import { canonicalIdeaUrl, classifyIdeaInput, parseReliableIdeaFields } from "./idea-input";
import { fetchIdeaPageMetadata } from "./idea-page-metadata";
import type { ResearchItem, ResearchMutationResult } from "./types";

const captureSchema = z
  .object({
    tripId: z.uuid(),
    operationId: z.uuid(),
    kind: z.enum(["flight", "stay", "car", "activity"]),
    title: z.string().trim().max(300).nullable(),
    sourceUrl: z.url().max(2048).nullable(),
    shareText: z.string().trim().max(5000).nullable(),
  })
  .refine((value) => value.title || value.sourceUrl, "Add a link or a name.")
  .refine(
    (value) => !value.sourceUrl || /^https?:\/\//i.test(value.sourceUrl),
    "Use an http or https link.",
  );

export async function captureIdea(
  input: z.input<typeof captureSchema>,
): Promise<ResearchMutationResult<ResearchItem>> {
  const parsed = captureSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid idea." };
  const database = await getRelationalDatabase();
  const fields =
    parsed.data.sourceUrl && classifyIdeaInput(parsed.data.sourceUrl).kind === parsed.data.kind
      ? parseReliableIdeaFields(parsed.data.sourceUrl)
      : parseReliableIdeaFields(null);
  const metadata = parsed.data.sourceUrl
    ? await fetchIdeaPageMetadata(parsed.data.sourceUrl)
    : null;
  const { data, error } = await database.rpc("capture_idea_v1", {
    target_trip_id: parsed.data.tripId,
    target_operation_id: parsed.data.operationId,
    requested_kind: parsed.data.kind,
    requested_title: parsed.data.title ?? metadata?.title ?? fields.locationText,
    requested_source_url: parsed.data.sourceUrl,
    requested_share_text: parsed.data.shareText,
    requested_fields: {
      ...fields,
      locationText: fields.locationText ?? metadata?.locationText ?? null,
    },
  });
  if (error || !data) return { error: error?.message ?? "The idea could not be saved." };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return loadResearchItem(parsed.data.tripId, parsed.data.operationId);
}

export async function previewIdeaLink(sourceUrl: string) {
  if (
    !z.url().max(2048).safeParse(sourceUrl).success ||
    !(await getAuthProvider().getCurrentUser())
  )
    return { title: null, locationText: null, status: "unsupported" as const };
  return fetchIdeaPageMetadata(sourceUrl);
}

const mergeSchema = z.object({
  tripId: z.uuid(),
  researchItemId: z.uuid(),
  sourceUrl: z.url(),
  shareText: z.string().trim().min(1).max(5000),
  expectedVersion: z.number().int().positive(),
  operationId: z.uuid(),
});

export async function mergeIdeaSource(
  input: z.input<typeof mergeSchema>,
): Promise<ResearchMutationResult<ResearchItem>> {
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid source." };
  const current = await loadResearchItem(parsed.data.tripId, parsed.data.researchItemId);
  if (!current.data) return current;
  if (
    !current.data.source_url ||
    canonicalIdeaUrl(current.data.source_url) !== canonicalIdeaUrl(parsed.data.sourceUrl)
  )
    return { error: "This is a different source." };
  const database = await getRelationalDatabase();
  const { error } = await database.rpc("merge_idea_source_v1", {
    target_trip_id: parsed.data.tripId,
    target_research_item_id: parsed.data.researchItemId,
    expected_version: parsed.data.expectedVersion,
    requested_share_text: parsed.data.shareText,
    target_operation_id: parsed.data.operationId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return loadResearchItem(parsed.data.tripId, parsed.data.researchItemId);
}

export type IdeaChoice = { id: string; position: number; itemIds: string[] };
export type IdeaComparison = { id: string; title: string; choices: IdeaChoice[] };

const comparisonSchema = z.object({
  tripId: z.uuid(),
  title: z.string().trim().min(1).max(160),
  choices: z.array(z.array(z.uuid()).min(1)).min(2),
});

export async function createIdeaComparison(
  input: z.input<typeof comparisonSchema>,
): Promise<ResearchMutationResult<{ id: string }>> {
  const parsed = comparisonSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid comparison." };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("create_idea_comparison_v2", {
    target_trip_id: parsed.data.tripId,
    requested_title: parsed.data.title,
    requested_choices: parsed.data.choices as Json,
  });
  if (error || !data) return { error: error?.message ?? "The comparison could not be created." };
  const result = z.object({ id: z.uuid() }).safeParse(data);
  if (!result.success) return { error: "The comparison result could not be read." };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: result.data };
}

export async function loadIdeaComparisons(
  tripId: string,
): Promise<ResearchMutationResult<IdeaComparison[]>> {
  if (!z.uuid().safeParse(tripId).success) return { error: "Invalid trip." };
  const database = await getRelationalDatabase();
  let response = await database.rpc("list_idea_comparisons_v1", { target_trip_id: tripId });
  if (response.error && /fetch failed/i.test(response.error.message))
    response = await database.rpc("list_idea_comparisons_v1", { target_trip_id: tripId });
  const { data, error } = response;
  if (error || data === null) return { error: "Comparisons could not be loaded." };
  const parsed = z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        choices: z.array(
          z.object({
            id: z.uuid(),
            position: z.number(),
            itemIds: z.array(z.uuid()),
          }),
        ),
      }),
    )
    .safeParse(data);
  return parsed.success ? { data: parsed.data } : { error: "Comparisons could not be read." };
}

const deleteComparisonSchema = z.object({
  tripId: z.uuid(),
  comparisonId: z.uuid(),
  operationId: z.uuid(),
});

export async function deleteIdeaComparison(
  input: z.input<typeof deleteComparisonSchema>,
): Promise<ResearchMutationResult<{ status: string }>> {
  const parsed = deleteComparisonSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid comparison." };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("delete_idea_comparison_v1", {
    target_trip_id: parsed.data.tripId,
    target_comparison_id: parsed.data.comparisonId,
    target_operation_id: parsed.data.operationId,
  });
  if (error || !data) return { error: error?.message ?? "The comparison could not be deleted." };
  const result = z.object({ status: z.string() }).safeParse(data);
  if (!result.success) return { error: "The comparison result could not be read." };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: result.data };
}

const applyChoiceSchema = z.object({
  tripId: z.uuid(),
  variantId: z.uuid(),
  comparisonId: z.uuid(),
  choiceId: z.uuid(),
  dayId: z.uuid().nullable(),
  operationId: z.uuid(),
});

export async function applyIdeaChoice(
  input: z.input<typeof applyChoiceSchema>,
): Promise<ResearchMutationResult<{ switched: boolean; status: string }>> {
  const parsed = applyChoiceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid choice." };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("apply_idea_choice_v1", {
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
    target_comparison_id: parsed.data.comparisonId,
    target_choice_id: parsed.data.choiceId,
    requested_day_id: parsed.data.dayId,
    target_operation_id: parsed.data.operationId,
  });
  if (error || !data) return { error: error?.message ?? "The choice could not be added to Plan." };
  const result = z.object({ switched: z.boolean(), status: z.string() }).safeParse(data);
  if (!result.success) return { error: "The Plan changed, but its result could not be read." };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: result.data };
}

const applySingleSchema = z.object({
  tripId: z.uuid(),
  variantId: z.uuid(),
  researchItemId: z.uuid(),
  dayId: z.uuid().nullable(),
  beforeItemId: z.uuid().nullable(),
  operationId: z.uuid(),
});

export async function applySingleIdea(
  input: z.input<typeof applySingleSchema>,
): Promise<ResearchMutationResult<{ status: string; itemId?: string }>> {
  const parsed = applySingleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid idea." };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("apply_single_idea_v1", {
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
    target_research_item_id: parsed.data.researchItemId,
    requested_day_id: parsed.data.dayId,
    requested_before_item_id: parsed.data.beforeItemId,
    target_operation_id: parsed.data.operationId,
  });
  if (error || !data) return { error: error?.message ?? "The idea could not be added to Plan." };
  const result = z.object({ status: z.string(), itemId: z.uuid().optional() }).safeParse(data);
  if (!result.success) return { error: "The Plan changed, but its result could not be read." };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: result.data };
}
