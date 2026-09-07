import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";

export class ItineraryMutationError extends Error {
  constructor(
    message: string,
    readonly code?: "conflict" | "forbidden" | "unexpected" | "validation",
  ) {
    super(message);
    this.name = "ItineraryMutationError";
  }
}

export function isItineraryConflict(error: unknown): error is ItineraryMutationError {
  return error instanceof ItineraryMutationError && error.code === "conflict";
}

export function requireData<T>(result: {
  code?: "conflict" | "forbidden" | "unexpected" | "validation";
  data?: T | null;
  error?: string | null;
}) {
  if (!result.data)
    throw new ItineraryMutationError(
      result.error ?? "The itinerary change could not be saved.",
      result.code,
    );
  return result.data;
}

export function replaceItem(workspace: PlannerWorkspace | undefined, item: ItineraryItem) {
  if (!workspace) return workspace;
  return {
    ...workspace,
    days: workspace.days.map((day) => ({
      ...day,
      items:
        day.id === item.day_id
          ? [...day.items.filter(({ id }) => id !== item.id), item].sort(
              (a, b) => a.sort_order - b.sort_order,
            )
          : day.items.filter(({ id }) => id !== item.id),
    })),
  };
}

export function removeItem(workspace: PlannerWorkspace | undefined, itemId: string) {
  if (!workspace) return workspace;
  return {
    ...workspace,
    days: workspace.days.map((day) => ({
      ...day,
      items: day.items.filter(({ id }) => id !== itemId),
    })),
  };
}

export function removeItems(workspace: PlannerWorkspace | undefined, itemIds: string[]) {
  if (!workspace) return workspace;
  const removed = new Set(itemIds);
  return {
    ...workspace,
    days: workspace.days.map((day) => ({
      ...day,
      items: day.items.filter(({ id }) => !removed.has(id)),
    })),
  };
}

export function projectWorkspaceDraft(
  workspace: PlannerWorkspace,
  draft: ItineraryItem | null,
): PlannerWorkspace {
  return draft ? (replaceItem(workspace, draft) ?? workspace) : workspace;
}
