import type { Json } from "@/types/database";

export type TripStatus = "done" | "open" | string;
export type TripRole = "owner" | "collaborator";

export type Trip = Readonly<{
  created_at: string;
  currency: string;
  day_count: number;
  end_date: string | null;
  id: string;
  owner_id: string;
  role: TripRole;
  route_variants?: ReadonlyArray<
    Readonly<{ color: string; id: string; is_primary: boolean; name: string }>
  >;
  start_date: string | null;
  status: TripStatus;
  timezone: string;
  title: string;
  updated_at: string;
  version: number;
}>;

export type CreateTripInput = Readonly<{
  currency: string;
  dayCount: number;
  locale: "en" | "zh-CN";
  operationId: string;
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
  expectedVersion: number;
  operationId: string;
}>;

export type TripMember = Readonly<{
  displayLabel: string;
  joinedAt: string;
  memberId: string;
  role: TripRole;
  userId: string;
}>;

export type TripHistoryEntry = Readonly<{
  actorLabel: string;
  changes: Json;
  createdAt: string;
  eventType: string;
  id: string;
}>;
export type TripHistoryPage = Readonly<{
  entries: TripHistoryEntry[];
  nextCursor: Readonly<{ createdAt: string; id: string }> | null;
}>;

export interface TripRepository {
  listForCurrentUser(input?: { status?: TripStatus }): Promise<Trip[]>;
  getById(id: string): Promise<Trip | null>;
  getDefaultCurrencyForCurrentUser(): Promise<string | null>;
  create(input: CreateTripInput): Promise<Trip>;
  importGuestDraft(input: {
    draftId: string;
    locale: "en" | "zh-CN";
    payload: Json;
  }): Promise<Trip>;
  update(id: string, input: UpdateTripInput): Promise<Trip>;
  setStatus(
    id: string,
    status: TripStatus,
    expectedVersion: number,
    operationId: string,
  ): Promise<Trip>;
  renameIfTitle(
    id: string,
    currentTitle: string,
    nextTitle: string,
    expectedVersion: number,
    operationId: string,
  ): Promise<boolean>;
  remove(id: string, expectedVersion: number, operationId: string): Promise<void>;
  listMembers(id: string): Promise<TripMember[]>;
  inviteCollaborator(id: string, identifier: string, operationId: string): Promise<void>;
  removeCollaborator(id: string, memberId: string, operationId: string): Promise<void>;
  listHistory(id: string, cursor?: { createdAt: string; id: string }): Promise<TripHistoryPage>;
}
