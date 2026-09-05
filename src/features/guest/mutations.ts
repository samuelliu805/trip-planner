import { insertActivityAtPlacement } from "../itinerary/activity-order.ts";
import {
  clearItineraryItemsSchema,
  copyItineraryItemsSchema,
  insertTripDaySchema,
  removeTripDaySchema,
  reorderItineraryItemsSchema,
  type ClearItineraryItemsInput,
  type CopyItineraryItemsInput,
  type InsertTripDayInput,
  type RemoveTripDayInput,
  type ReorderItineraryItemsInput,
} from "../itinerary/day-schema.ts";
import {
  createItineraryItemSchema,
  deleteItineraryItemSchema,
  updateItineraryItemSchema,
  type CreateItineraryItemInput,
  type DeleteItineraryItemInput,
  type UpdateItineraryItemInput,
} from "../itinerary/item-schema.ts";
import { normalizedOptional, scheduleKind } from "../itinerary/mutation-helpers.ts";
import type { ItineraryItem } from "../itinerary/types.ts";
import { isDefaultTripTitle, tripTitleFromPlace } from "../trips/create-defaults.ts";

import {
  itemLinks,
  placeForItem,
  serializableDetails,
  withTripDates,
} from "./mutation-draft-helpers.ts";
import type { GuestTripDraft } from "./schema.ts";

export type CommitGuestDraft = (
  update: (current: GuestTripDraft) => GuestTripDraft,
) => GuestTripDraft;

export class GuestDraftMutations {
  private readonly commit: CommitGuestDraft;
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    commit: CommitGuestDraft,
    createId: () => string = () => crypto.randomUUID(),
    now: () => Date = () => new Date(),
  ) {
    this.commit = commit;
    this.createId = createId;
    this.now = now;
  }

  async createItem(input: CreateItineraryItemInput) {
    const values = createItineraryItemSchema.parse(input);
    let created: ItineraryItem | undefined;
    this.commit((draft) => {
      const day = draft.workspace.days.find(({ id }) => id === values.dayId);
      if (!day) throw new Error("The selected day no longer exists.");
      const timestamp = this.now().toISOString();
      const id = this.createId();
      const place = placeForItem(values.placeId, values.placeSnapshot, undefined, this.createId);
      const item: ItineraryItem = {
        attachments: [],
        booking_url: values.links?.[0]?.url ?? normalizedOptional(values.bookingUrl),
        created_at: timestamp,
        day_id: day.id,
        details: serializableDetails(values.details),
        end_time: normalizedOptional(values.endTime),
        id,
        links: itemLinks(id, values.links, this.createId),
        notes: normalizedOptional(values.notes),
        place,
        place_id: place?.id ?? null,
        price_amount: values.priceAmount ?? null,
        price_currency: values.priceAmount == null ? null : (values.priceCurrency ?? null),
        schedule_kind: scheduleKind(values.startTime, values.endTime),
        schedule_text: null,
        sort_order: day.items.length,
        start_time: normalizedOptional(values.startTime),
        title: values.title.trim(),
        trip_id: draft.draftId,
        type: values.type,
        updated_at: timestamp,
        variant_id: draft.workspace.variant.id,
      };
      created = item;
      const days = draft.workspace.days.map((candidate) =>
        candidate.id === day.id
          ? {
              ...candidate,
              items: insertActivityAtPlacement(candidate.items, item, values.insertAfterItemId),
            }
          : candidate,
      );
      const title =
        place && isDefaultTripTitle(draft.trip.title)
          ? tripTitleFromPlace(place) || draft.trip.title
          : draft.trip.title;
      return {
        ...draft,
        trip: { ...draft.trip, title },
        workspace: { ...draft.workspace, days },
      };
    });
    return created!;
  }

  async updateItem(input: UpdateItineraryItemInput) {
    const values = updateItineraryItemSchema.parse(input);
    let updated: ItineraryItem | undefined;
    this.commit((draft) => {
      const sourceDay = draft.workspace.days.find((day) =>
        day.items.some(({ id }) => id === values.id),
      );
      const existing = sourceDay?.items.find(({ id }) => id === values.id);
      if (!sourceDay || !existing) throw new Error("The itinerary item no longer exists.");
      const targetDay = draft.workspace.days.find(
        ({ id }) => id === (values.dayId ?? existing.day_id),
      );
      if (!targetDay) throw new Error("The selected day no longer exists.");
      const place = placeForItem(values.placeId, values.placeSnapshot, existing, this.createId);
      const next: ItineraryItem = {
        ...existing,
        ...(values.links !== undefined && {
          booking_url: values.links[0]?.url ?? null,
          links: itemLinks(existing.id, values.links, this.createId),
        }),
        ...(values.links === undefined &&
          values.bookingUrl !== undefined && {
            booking_url: normalizedOptional(values.bookingUrl),
          }),
        day_id: targetDay.id,
        ...(values.details !== undefined && { details: serializableDetails(values.details) }),
        ...(values.endTime !== undefined && { end_time: normalizedOptional(values.endTime) }),
        ...(values.notes !== undefined && { notes: normalizedOptional(values.notes) }),
        place,
        place_id: place?.id ?? null,
        ...(values.priceAmount !== undefined && { price_amount: values.priceAmount }),
        ...((values.priceAmount !== undefined || values.priceCurrency !== undefined) && {
          price_currency:
            values.priceAmount === null ? null : (values.priceCurrency ?? existing.price_currency),
        }),
        ...(values.startTime !== undefined && { start_time: normalizedOptional(values.startTime) }),
        schedule_kind: scheduleKind(
          values.startTime === undefined ? existing.start_time : values.startTime,
          values.endTime === undefined ? existing.end_time : values.endTime,
        ),
        ...(values.title !== undefined && { title: values.title.trim() }),
        type: values.type,
        updated_at: this.now().toISOString(),
      };
      updated = next;
      const without = draft.workspace.days.map((day) => ({
        ...day,
        items: day.items.filter(({ id }) => id !== next.id),
      }));
      const days = without.map((day) =>
        day.id === targetDay.id
          ? { ...day, items: insertActivityAtPlacement(day.items, next, values.insertAfterItemId) }
          : day,
      );
      return { ...draft, workspace: { ...draft.workspace, days } };
    });
    return updated!;
  }

  async deleteItem(input: DeleteItineraryItemInput) {
    const { id } = deleteItineraryItemSchema.parse(input);
    this.removeItems([id]);
  }

  async clearItems(input: ClearItineraryItemsInput) {
    const { itemIds } = clearItineraryItemsSchema.parse(input);
    this.removeItems(itemIds);
  }

  private removeItems(ids: string[]) {
    const selected = new Set(ids);
    this.commit((draft) => ({
      ...draft,
      workspace: {
        ...draft.workspace,
        days: draft.workspace.days.map((day) => ({
          ...day,
          items: day.items
            .filter(({ id }) => !selected.has(id))
            .map((item, sort_order) => ({ ...item, sort_order })),
        })),
      },
    }));
  }

  async insertDay(input: InsertTripDayInput) {
    const { beforeDayNumber } = insertTripDaySchema.parse(input);
    this.commit((draft) => {
      if (draft.workspace.days.length >= 366) throw new Error("Trips can span at most 366 days.");
      const insertion = Math.max(0, Math.min(beforeDayNumber - 1, draft.workspace.days.length));
      const days = [...draft.workspace.days];
      days.splice(insertion, 0, {
        date: null,
        day_number: insertion + 1,
        id: this.createId(),
        items: [],
        notes: null,
        title: null,
        variant_id: draft.workspace.variant.id,
      });
      return withTripDates(draft, days);
    });
  }

  async removeDay(input: RemoveTripDayInput) {
    const { dayId } = removeTripDaySchema.parse(input);
    this.commit((draft) => {
      if (draft.workspace.days.length <= 1) throw new Error("A trip must keep at least one day.");
      const days = draft.workspace.days.filter(({ id }) => id !== dayId);
      if (days.length === draft.workspace.days.length)
        throw new Error("The selected day no longer exists.");
      return withTripDates(draft, days);
    });
  }

  async reorderItems(input: ReorderItineraryItemsInput) {
    const values = reorderItineraryItemsSchema.parse(input);
    let result: ItineraryItem[] = [];
    this.commit((draft) => {
      const order = new Map(values.items.map(({ id, sortOrder }) => [id, sortOrder]));
      const days = draft.workspace.days.map((day) => {
        if (day.id !== values.dayId) return day;
        const items = day.items
          .map((item) => ({ ...item, sort_order: order.get(item.id) ?? item.sort_order }))
          .sort((left, right) => left.sort_order - right.sort_order)
          .map((item, sort_order) => ({ ...item, sort_order }));
        result = items.filter(({ id }) => order.has(id));
        return { ...day, items };
      });
      return { ...draft, workspace: { ...draft.workspace, days } };
    });
    return result;
  }

  async copyItems(input: CopyItineraryItemsInput) {
    const values = copyItineraryItemsSchema.parse(input);
    let copied: ItineraryItem[] = [];
    this.commit((draft) => {
      const sources = draft.workspace.days
        .flatMap(({ items }) => items)
        .filter(({ id }) => values.sourceItemIds.includes(id));
      const timestamp = this.now().toISOString();
      copied = sources.map((source) => {
        const id = this.createId();
        return {
          ...source,
          attachments: [],
          created_at: timestamp,
          day_id: values.targetDayId,
          id,
          links: source.links?.map((link) => ({ ...link, id: this.createId(), item_id: id })),
          place: values.preservePlace === false ? null : source.place,
          place_id: values.preservePlace === false ? null : source.place_id,
          updated_at: timestamp,
        };
      });
      const days = draft.workspace.days.map((day) =>
        day.id === values.targetDayId
          ? {
              ...day,
              items: [...day.items, ...copied].map((item, sort_order) => ({ ...item, sort_order })),
            }
          : day,
      );
      return { ...draft, workspace: { ...draft.workspace, days } };
    });
    return copied;
  }
}
