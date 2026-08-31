import type { Trip } from "@/platform/contracts/trips";

export type TripActionState = {
  error?: string;
  success?: string;
};

export type TripListEntry = Trip & {
  route_variants: NonNullable<Trip["route_variants"]>;
};
