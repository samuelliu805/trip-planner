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

export const createRouteVariantSchema = z.object({
  color: variantColorSchema,
  name: variantNameSchema,
  sourceVariantId: variantIdentitySchema,
  tripId: variantIdentitySchema,
});

export const duplicateRouteVariantSchema = createRouteVariantSchema;

export const updateRouteVariantSchema = z.object({
  color: variantColorSchema,
  name: variantNameSchema,
  tripId: variantIdentitySchema,
  variantId: variantIdentitySchema,
});

export const routeVariantIdentitySchema = z.object({
  tripId: variantIdentitySchema,
  variantId: variantIdentitySchema,
});

export type CreateRouteVariantInput = z.input<typeof createRouteVariantSchema>;
export type DuplicateRouteVariantInput = z.input<typeof duplicateRouteVariantSchema>;
export type UpdateRouteVariantInput = z.input<typeof updateRouteVariantSchema>;
export type RouteVariantIdentityInput = z.input<typeof routeVariantIdentitySchema>;
