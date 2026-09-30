import type { Trip } from "@/platform/contracts/trips";
import type { TripCoverSource } from "./cover-selection";

export type TripActionState = {
  conflict?: boolean;
  error?: string;
  success?: string;
};

export type TripListEntry = Trip & {
  route_variants: NonNullable<Trip["route_variants"]>;
  coverSource?: TripCoverSource;
};
