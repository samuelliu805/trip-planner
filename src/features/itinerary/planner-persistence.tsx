"use client";

import { createContext, useContext, type ReactNode } from "react";

import type {
  ClearItineraryItemsInput,
  CopyItineraryItemsInput,
  InsertTripDayInput,
  RemoveTripDayInput,
  ReorderItineraryItemsInput,
} from "./day-schema";
import type {
  CreateItineraryItemInput,
  DeleteItineraryItemInput,
  UpdateItineraryItemInput,
} from "./item-schema";
import type { ItineraryItem } from "./types";

export type PlannerPersistence = {
  actorType: "anonymous";
  clearItems: (input: ClearItineraryItemsInput) => Promise<void>;
  copyItems: (input: CopyItineraryItemsInput) => Promise<ItineraryItem[]>;
  createItem: (input: CreateItineraryItemInput) => Promise<ItineraryItem>;
  deleteItem: (input: DeleteItineraryItemInput) => Promise<void>;
  insertDay: (input: InsertTripDayInput) => Promise<void>;
  removeDay: (input: RemoveTripDayInput) => Promise<void>;
  reorderItems: (input: ReorderItineraryItemsInput) => Promise<ItineraryItem[]>;
  requestAccountFeature: (feature: "attachment" | "route", itemId?: string) => void;
  updateItem: (input: UpdateItineraryItemInput) => Promise<ItineraryItem>;
};

const PlannerPersistenceContext = createContext<PlannerPersistence | null>(null);

export function PlannerPersistenceProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: PlannerPersistence;
}) {
  return (
    <PlannerPersistenceContext.Provider value={value}>
      {children}
    </PlannerPersistenceContext.Provider>
  );
}

export function usePlannerPersistence() {
  return useContext(PlannerPersistenceContext);
}
