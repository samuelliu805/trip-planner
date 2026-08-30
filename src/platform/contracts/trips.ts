export type TripStatus = "done" | "open" | string;

export type Trip = Readonly<{
  created_at: string;
  currency: string;
  day_count: number;
  end_date: string | null;
  id: string;
  owner_id: string;
  route_variants?: ReadonlyArray<
    Readonly<{ color: string; id: string; is_primary: boolean; name: string }>
  >;
  start_date: string | null;
  status: TripStatus;
  timezone: string;
  title: string;
  updated_at: string;
}>;

export type CreateTripInput = Readonly<{
  currency: string;
  dayCount: number;
  timezone: string;
  title: string;
}>;

export type UpdateTripInput = Readonly<{
  currency: string;
  dayCount: number;
  endDate: string | null;
  startDate: string | null;
  timezone: string;
  title: string;
}>;

export interface TripRepository {
  listForCurrentUser(input?: { status?: TripStatus }): Promise<Trip[]>;
  getById(id: string): Promise<Trip | null>;
  create(input: CreateTripInput): Promise<Trip>;
  update(id: string, input: UpdateTripInput): Promise<Trip>;
  remove(id: string): Promise<void>;
}
