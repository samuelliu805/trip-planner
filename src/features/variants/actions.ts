"use server";

import { revalidatePath } from "next/cache";

import { getPlannerVariants } from "@/features/itinerary/data";
import { getRelationalDatabase } from "@/platform/composition/server";

import { getVariantComparison } from "./comparison-data";
import { getVariantDecisionSummary } from "./decision-summary-data";

import {
  createRouteVariantSchema,
  deleteRouteVariantSchema,
  duplicateRouteVariantSchema,
  routeVariantIdentitySchema,
  updateRouteVariantSchema,
  type CreateRouteVariantInput,
  type DeleteRouteVariantInput,
  type DuplicateRouteVariantInput,
  type RouteVariantIdentityInput,
  type UpdateRouteVariantInput,
} from "./schema";
import type { VariantMutationResult } from "./types";
import { reportVariantMutation } from "./telemetry.server";

const domainMessages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Sign in again before managing route variants.",
  TRIP_OWNER_REQUIRED: "Only the trip owner can manage route variants.",
  VARIANT_COLOR_INVALID: "Choose one of the available route colors.",
  VARIANT_DUPLICATION_MAPPING_FAILED:
    "The route could not be copied safely. No changes were saved.",
  VARIANT_FINAL_DELETE_FORBIDDEN: "A trip must keep at least one route variant.",
  VARIANT_LIMIT_REACHED: "A trip can have at most three route variants.",
  VARIANT_NAME_INVALID: "Route names must contain between 1 and 80 characters.",
  VARIANT_NAME_TAKEN: "Route names must be unique within this trip.",
  VARIANT_NOT_FOUND: "That route variant is no longer available.",
  VARIANT_PRIMARY_DELETE_FORBIDDEN: "Set another route as primary before deleting this one.",
  VARIANT_PRIMARY_REQUIRED: "This trip must keep exactly one primary route variant.",
  VARIANT_SOURCE_HAS_NO_DAYS: "The source route does not contain a planning horizon to copy.",
  VARIANT_SOURCE_NOT_FOUND: "The source route does not belong to this trip.",
};

function firstIssue(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "Check the route variant details.";
}

function variantError(message?: string) {
  if (!message) return "The route variant could not be changed.";
  const code = Object.keys(domainMessages).find((candidate) => message.includes(candidate));
  return code ? domainMessages[code] : "The route variant could not be changed.";
}

async function mutationResult(
  tripId: string,
  variantId: string | null,
  rpcError?: { code?: string; message: string } | null,
  telemetry?: {
    action?: "blank" | "duplicate";
    mutation: "create" | "update" | "delete" | "primary";
    operationId?: string;
  },
): Promise<VariantMutationResult> {
  if (rpcError || !variantId) {
    const result = {
      code:
        rpcError?.code === "40001"
          ? ("conflict" as const)
          : rpcError?.code === "42501"
            ? ("forbidden" as const)
            : ("unexpected" as const),
      error:
        rpcError?.code === "40001"
          ? "Someone else changed this Plan first. Reload the latest Plan."
          : variantError(rpcError?.message),
    };
    return telemetry ? reportVariantMutation({ ...telemetry, result }) : result;
  }
  if (telemetry) await reportVariantMutation({ ...telemetry, result: { data: { variantId } } });
  const variants = await getPlannerVariants(tripId);
  if (variants.error || !variants.data)
    return { error: variants.error ?? "The updated route variants could not be loaded." };
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  return { data: { variantId, variants: variants.data } };
}

export async function loadRouteVariants(tripId: string) {
  return getPlannerVariants(tripId);
}

export async function loadVariantComparison(tripId: string, dayNumber?: number) {
  return getVariantComparison(tripId, dayNumber);
}

export async function loadVariantDecisionSummary(tripId: string) {
  return getVariantDecisionSummary(tripId);
}

export async function createRouteVariant(
  input: CreateRouteVariantInput,
): Promise<VariantMutationResult> {
  const parsed = createRouteVariantSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("create_route_variant_v3", {
    duplicate_content: false,
    expected_source_content_version: parsed.data.expectedSourceContentVersion,
    expected_source_days_version: parsed.data.expectedSourceDaysVersion,
    expected_source_items_version: parsed.data.expectedSourceItemsVersion,
    expected_source_version: parsed.data.expectedSourceVersion,
    source_variant_id: parsed.data.sourceVariantId,
    target_operation_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
    variant_color: parsed.data.color,
    variant_name: parsed.data.name,
  });
  return mutationResult(
    parsed.data.tripId,
    (data as { variantId?: string } | null)?.variantId ?? null,
    error,
    {
      action: "blank",
      mutation: "create",
      operationId: parsed.data.operationId,
    },
  );
}

export async function duplicateRouteVariant(
  input: DuplicateRouteVariantInput,
): Promise<VariantMutationResult> {
  const parsed = duplicateRouteVariantSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("create_route_variant_v3", {
    duplicate_content: true,
    expected_source_content_version: parsed.data.expectedSourceContentVersion,
    expected_source_days_version: parsed.data.expectedSourceDaysVersion,
    expected_source_items_version: parsed.data.expectedSourceItemsVersion,
    expected_source_version: parsed.data.expectedSourceVersion,
    source_variant_id: parsed.data.sourceVariantId,
    target_operation_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
    variant_color: parsed.data.color,
    variant_name: parsed.data.name,
  });
  return mutationResult(
    parsed.data.tripId,
    (data as { variantId?: string } | null)?.variantId ?? null,
    error,
    {
      action: "duplicate",
      mutation: "create",
      operationId: parsed.data.operationId,
    },
  );
}

export async function updateRouteVariant(
  input: UpdateRouteVariantInput,
): Promise<VariantMutationResult> {
  const parsed = updateRouteVariantSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("update_route_variant_v2", {
    expected_version: parsed.data.expectedVersion,
    target_operation_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
    variant_color: parsed.data.color,
    variant_name: parsed.data.name,
  });
  return mutationResult(
    parsed.data.tripId,
    (data as { variantId?: string } | null)?.variantId ?? null,
    error,
    {
      mutation: "update",
      operationId: parsed.data.operationId,
    },
  );
}

export async function setPrimaryRouteVariant(
  input: RouteVariantIdentityInput,
): Promise<VariantMutationResult> {
  const parsed = routeVariantIdentitySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("set_primary_route_variant_v2", {
    expected_version: parsed.data.expectedVersion,
    target_operation_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  return mutationResult(
    parsed.data.tripId,
    (data as { variantId?: string } | null)?.variantId ?? null,
    error,
    {
      mutation: "primary",
      operationId: parsed.data.operationId,
    },
  );
}

export async function deleteRouteVariant(
  input: DeleteRouteVariantInput,
): Promise<VariantMutationResult> {
  const parsed = deleteRouteVariantSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("delete_route_variant_v3", {
    expected_content_version: parsed.data.expectedContentVersion,
    expected_days_version: parsed.data.expectedDaysVersion,
    expected_items_version: parsed.data.expectedItemsVersion,
    expected_version: parsed.data.expectedVersion,
    target_operation_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  return mutationResult(
    parsed.data.tripId,
    (data as { variantId?: string } | null)?.variantId ?? null,
    error,
    {
      mutation: "delete",
      operationId: parsed.data.operationId,
    },
  );
}
