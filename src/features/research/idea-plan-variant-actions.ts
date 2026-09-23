"use server";

import { z } from "zod";

import { getPlannerVariants } from "@/features/itinerary/data";
import { deleteRouteVariant, duplicateRouteVariant } from "@/features/variants/actions";
import { variantColorPalette } from "@/features/variants/schema";

import { applyIdeaChoice, applySingleIdea } from "./idea-actions";
import type { ResearchMutationResult } from "./types";

const common = z.object({
  tripId: z.uuid(),
  variantId: z.uuid(),
  operationId: z.uuid(),
});
const single = common.extend({ researchItemId: z.uuid() });
const choice = common.extend({ comparisonId: z.uuid(), choiceId: z.uuid() });

async function copyPlanAndApply(
  input: z.infer<typeof common>,
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
  const applied = await apply(copy.data.variantId);
  if (applied.data) return { data: { variantId: copy.data.variantId } };
  const created = copy.data.variants.find((variant) => variant.id === copy.data.variantId);
  if (created)
    await deleteRouteVariant({
      expectedContentVersion: created.content_version,
      expectedDaysVersion: created.days_version,
      expectedItemsVersion: created.items_version,
      expectedVersion: created.version,
      operationId: crypto.randomUUID(),
      tripId: input.tripId,
      variantId: created.id,
    });
  return { error: applied.error ?? "The flight could not be added to the new Plan." };
}

/** Ideas are trip-owned, so duplicating a Plan keeps the same Ideas available. */
export async function applySingleIdeaToNewVariant(input: z.input<typeof single>) {
  const parsed = single.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid idea." };
  return copyPlanAndApply(parsed.data, (variantId) =>
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
  return copyPlanAndApply(parsed.data, (variantId) =>
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
