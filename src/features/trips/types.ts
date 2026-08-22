import type { Tables } from "@/types/database";

export type TripActionState = {
  error?: string;
  success?: string;
};

/** One row of the Trips list: the trip plus its primary route, as `listTrips` selects them. */
export type TripListEntry = Tables<"trips"> & {
  route_variants: Pick<Tables<"route_variants">, "color" | "id" | "is_primary" | "name">[];
};
