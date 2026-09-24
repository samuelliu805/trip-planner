"use server";

import { z } from "zod";

import { getPlannerVariants } from "@/features/itinerary/data";
import { deleteRouteVariant, duplicateRouteVariant } from "@/features/variants/actions";
import { variantColorPalette } from "@/features/variants/schema";
import { getRelationalDatabase } from "@/platform/composition/server";

import { loadResearchItem } from "./actions";
import { applyIdeaChoice, applySingleIdea, loadIdeaComparisons } from "./idea-actions";
import { ideaJourneyDates } from "./idea-plan-dates";
import type { ResearchMutationResult } from "./types";

const common = z.object({
  tripId: z.uuid(),
  variantId: z.uuid(),
  operationId: z.uuid(),
  anchorDayNumber: z.number().int().min(1).max(366),
});
const single = common.extend({ researchItemId: z.uuid() });
const choice = common.extend({ comparisonId: z.uuid(), choiceId: z.uuid() });

async function copyPlanAndApply(
  input: z.infer<typeof common>,
  departureDate: string,
  apply: (variantId: string) => Promise<ResearchMutationResult<unknown>>,
): Promise<ResearchMutationResult<{ variantId: string }>> {
  const variants = await getPlannerVariants(input.tripId);
  const source = variants.data?.find((variant) => variant.id === input.variantId);
  if (!source) return { error: variants.error ?? "The selected Plan could not be loaded." };
  const color = variantColorPalette.find(
    (candidate) =>
      !variants.data?.some((variant) => variant.color.toLowerCase() === candidate.value),
  )?.value;
  if (!color) return { error: "This trip has no space for another Plan." };
  const names = new Set(variants.data?.map((variant) => variant.name.toLowerCase()));
  const baseName = `${source.name} flights`.slice(0, 75);
  let name = baseName;
  for (let number = 2; names.has(name.toLowerCase()); number += 1)
    name = `${baseName} ${number}`.slice(0, 80);
  const copy = await duplicateRouteVariant({
    color,
    expectedSourceContentVersion: source.content_version,
    expectedSourceDaysVersion: source.days_version,
    expectedSourceItemsVersion: source.items_version,
    expectedSourceVersion: source.version,
    name,
    operationId: input.operationId,
    sourceVariantId: source.id,
    tripId: input.tripId,
  });
  if (!copy.data) return { error: copy.error ?? "The new Plan could not be created." };
  async function removeCopy() {
    const latest = await getPlannerVariants(input.tripId);
    const created = latest.data?.find((variant) => variant.id === copy.data?.variantId);
    if (!created) return;
    await deleteRouteVariant({
      expectedContentVersion: created.content_version,
      expectedDaysVersion: created.days_version,
      expectedItemsVersion: created.items_version,
      expectedVersion: created.version,
      operationId: crypto.randomUUID(),
      tripId: input.tripId,
      variantId: created.id,
    });
  }
  const database = await getRelationalDatabase();
  const rebased = await database.rpc("rebase_idea_variant_days_v1", {
    target_trip_id: input.tripId,
    target_variant_id: copy.data.variantId,
    requested_departure_date: departureDate,
    requested_anchor_day_number: input.anchorDayNumber,
    target_operation_id: crypto.randomUUID(),
  });
  if (rebased.error) {
    await removeCopy();
    return { error: rebased.error.message };
  }
  const applied = await apply(copy.data.variantId);
  if (applied.data) return { data: { variantId: copy.data.variantId } };
  await removeCopy();
  return { error: applied.error ?? "The flight could not be added to the new Plan." };
}

/** Ideas are trip-owned, so duplicating a Plan keeps the same Ideas available. */
export async function applySingleIdeaToNewVariant(input: z.input<typeof single>) {
  const parsed = single.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid idea." };
  const item = await loadResearchItem(parsed.data.tripId, parsed.data.researchItemId);
  if (!item.data) return { error: item.error ?? "The flight could not be loaded." };
  const departureDate = ideaJourneyDates(item.data)[0];
  if (!departureDate) return { error: "The flight needs a departure date." };
  return copyPlanAndApply(parsed.data, departureDate, (variantId) =>
    applySingleIdea({
      tripId: parsed.data.tripId,
      variantId,
      researchItemId: parsed.data.researchItemId,
      dayId: null,
      beforeItemId: null,
      operationId: crypto.randomUUID(),
    }),
  );
}

export async function applyIdeaChoiceToNewVariant(input: z.input<typeof choice>) {
  const parsed = choice.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid choice." };
  const comparisons = await loadIdeaComparisons(parsed.data.tripId);
  const selected = comparisons.data
    ?.find((entry) => entry.id === parsed.data.comparisonId)
    ?.choices.find((entry) => entry.id === parsed.data.choiceId);
  if (!selected) return { error: comparisons.error ?? "The choice could not be loaded." };
  const items = await Promise.all(
    selected.itemIds.map((id) => loadResearchItem(parsed.data.tripId, id)),
  );
  if (items.some((item) => !item.data)) return { error: "The choice could not be loaded." };
  const departureDate = items
    .flatMap((item) => (item.data ? ideaJourneyDates(item.data) : []))
    .sort()[0];
  if (!departureDate) return { error: "The choice needs a departure date." };
  return copyPlanAndApply(parsed.data, departureDate, (variantId) =>
    applyIdeaChoice({
      tripId: parsed.data.tripId,
      variantId,
      comparisonId: parsed.data.comparisonId,
      choiceId: parsed.data.choiceId,
      dayId: null,
      operationId: crypto.randomUUID(),
    }),
  );
}
