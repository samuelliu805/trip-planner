import { z } from "zod";
import { placeSnapshotSchema } from "../item-schema";
import { selectableTransportModes } from "../types";

// Validate shapes while accepting incomplete text, prices and link URLs.
const rawItemDraft = z.object({
  creationId: z.uuid().optional(),
  title: z.string().optional(),
  autoFilledTitle: z.string().nullable().optional(),
  startTime: z.string().optional(),
  arrivalTime: z.string().optional(),
  arrivalDate: z.string().optional(),
  departureDate: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  serviceNumber: z.string().optional(),
  priceAmount: z.string().optional(),
  priceCurrency: z.string().optional(),
  notes: z.string().optional(),
  originPlace: placeSnapshotSchema.nullable().optional(),
  destinationPlace: placeSnapshotSchema.nullable().optional(),
  place: placeSnapshotSchema.nullable().optional(),
  placeQuery: z.string().optional(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
  carAction: z.enum(["pickup", "return"]).optional(),
  carProvider: z.string().optional(),
  insertAfterItemId: z.string().nullable().optional(),
  transportMode: z.enum(selectableTransportModes).optional(),
});
export function validateRawItemDraft(values: Record<string, unknown>) {
  rawItemDraft.parse(values);
}
