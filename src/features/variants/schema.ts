import { z } from "zod";

export const variantColorPalette = [
  { label: "Forest", value: "#0f766e" },
  { label: "Ocean", value: "#2563eb" },
  { label: "Amber", value: "#d97706" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Rose", value: "#be123c" },
] as const;

const variantIdentitySchema = z.string().uuid();
const variantNameSchema = z.string().trim().min(1, "Enter a route name.").max(80);
const variantColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a route color.");
const operationIdSchema = z.uuid();

export const createRouteVariantSchema = z.object({
  color: variantColorSchema,
  expectedSourceContentVersion: z.number().int().positive(),
  expectedSourceDaysVersion: z.number().int().positive(),
  expectedSourceItemsVersion: z.number().int().positive(),
  expectedSourceVersion: z.number().int().positive(),
  name: variantNameSchema,
  sourceVariantId: variantIdentitySchema,
  tripId: variantIdentitySchema,
  operationId: operationIdSchema,
});

export const duplicateRouteVariantSchema = createRouteVariantSchema;

export const updateRouteVariantSchema = z.object({
  color: variantColorSchema,
  expectedVersion: z.number().int().positive(),
  name: variantNameSchema,
  tripId: variantIdentitySchema,
  variantId: variantIdentitySchema,
  operationId: operationIdSchema,
});

export const routeVariantIdentitySchema = z.object({
  expectedVersion: z.number().int().positive(),
  tripId: variantIdentitySchema,
  variantId: variantIdentitySchema,
  operationId: operationIdSchema,
});

export const deleteRouteVariantSchema = routeVariantIdentitySchema.extend({
  expectedContentVersion: z.number().int().positive(),
  expectedDaysVersion: z.number().int().positive(),
  expectedItemsVersion: z.number().int().positive(),
});

export type CreateRouteVariantInput = z.input<typeof createRouteVariantSchema>;
export type DuplicateRouteVariantInput = z.input<typeof duplicateRouteVariantSchema>;
export type UpdateRouteVariantInput = z.input<typeof updateRouteVariantSchema>;
export type RouteVariantIdentityInput = z.input<typeof routeVariantIdentitySchema>;
export type DeleteRouteVariantInput = z.input<typeof deleteRouteVariantSchema>;
