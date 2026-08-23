import type { Tables } from "@/types/database";

export type TripActionState = {
  error?: string;
  success?: string;
};

export type TripListEntry = Tables<"trips"> & {
  route_variants: Pick<Tables<"route_variants">, "color" | "id" | "is_primary" | "name">[];
};
