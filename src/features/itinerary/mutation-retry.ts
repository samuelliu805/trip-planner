"use client";

import { loadPlannerWorkspace } from "./actions";
import { isItineraryConflict } from "./query-cache";
import type { PlannerWorkspace } from "./types";

/** Retry one version conflict only when a fresh snapshot makes the same intent safe. */
export async function retryPlannerMutation<TInput, TResult>(
  input: TInput,
  send: (value: TInput) => Promise<TResult>,
  rebase: (value: TInput, latest: PlannerWorkspace) => TInput | null | Promise<TInput | null>,
  tripId: string,
  variantId: string,
): Promise<TResult> {
  try {
    return await send(input);
  } catch (error) {
    if (!isItineraryConflict(error)) throw error;
    const result = await loadPlannerWorkspace(tripId, variantId);
    const rebased = result.data && (await rebase(input, result.data));
    if (!rebased) throw error;
    // Rebasing changes the fingerprint; only an identical transport replay may reuse its ID.
    return send(
      rebased && typeof rebased === "object" && "operationId" in rebased
        ? { ...rebased, operationId: crypto.randomUUID() }
        : rebased,
    );
  }
}
