import type { PlannerVariant } from "../itinerary/types";

export const variantListQueryKey = (tripId: string) => ["planner-variants", tripId] as const;

type VariantListQueryClient = {
  getQueryData<T>(queryKey: readonly unknown[]): T | undefined;
  refetchQueries(filters: {
    exact: true;
    queryKey: readonly unknown[];
    type: "active";
  }): Promise<unknown>;
};

export async function refetchRouteVariantList(client: VariantListQueryClient, tripId: string) {
  const queryKey = variantListQueryKey(tripId);
  await client.refetchQueries({ exact: true, queryKey, type: "active" });
  return client.getQueryData<PlannerVariant[]>(queryKey);
}
