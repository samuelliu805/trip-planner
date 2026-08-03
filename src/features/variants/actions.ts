"use server";

import { revalidatePath } from "next/cache";

import { getPlannerVariants } from "@/features/itinerary/data";
import { createClient } from "@/lib/supabase/server";

import {
  createRouteVariantSchema,
  duplicateRouteVariantSchema,
  routeVariantIdentitySchema,
  updateRouteVariantSchema,
  type CreateRouteVariantInput,
  type DuplicateRouteVariantInput,
  type RouteVariantIdentityInput,
  type UpdateRouteVariantInput,
} from "./schema";
import type { VariantMutationResult } from "./types";

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
  rpcError?: string,
): Promise<VariantMutationResult> {
  if (rpcError || !variantId) return { error: variantError(rpcError) };
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

export async function createRouteVariant(
  input: CreateRouteVariantInput,
): Promise<VariantMutationResult> {
  const parsed = createRouteVariantSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_route_variant", {
    source_variant_id: parsed.data.sourceVariantId,
    target_trip_id: parsed.data.tripId,
    variant_color: parsed.data.color,
    variant_name: parsed.data.name,
  });
  return mutationResult(parsed.data.tripId, data, error?.message);
}

export async function duplicateRouteVariant(
  input: DuplicateRouteVariantInput,
): Promise<VariantMutationResult> {
  const parsed = duplicateRouteVariantSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_route_variant", {
    source_variant_id: parsed.data.sourceVariantId,
    target_trip_id: parsed.data.tripId,
    variant_color: parsed.data.color,
    variant_name: parsed.data.name,
  });
  return mutationResult(parsed.data.tripId, data, error?.message);
}

export async function updateRouteVariant(
  input: UpdateRouteVariantInput,
): Promise<VariantMutationResult> {
  const parsed = updateRouteVariantSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_route_variant_metadata", {
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
    variant_color: parsed.data.color,
    variant_name: parsed.data.name,
  });
  return mutationResult(parsed.data.tripId, data, error?.message);
}

export async function setPrimaryRouteVariant(
  input: RouteVariantIdentityInput,
): Promise<VariantMutationResult> {
  const parsed = routeVariantIdentitySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_primary_route_variant", {
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  return mutationResult(parsed.data.tripId, data, error?.message);
}

export async function deleteRouteVariant(
  input: RouteVariantIdentityInput,
): Promise<VariantMutationResult> {
  const parsed = routeVariantIdentitySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_route_variant", {
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  return mutationResult(parsed.data.tripId, data, error?.message);
}
