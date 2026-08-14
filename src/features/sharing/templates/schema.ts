import { z } from "zod";

export const PUBLIC_TEMPLATE_SCHEMA_VERSION = 1 as const;
export const PUBLIC_TEMPLATE_COMPILER_VERSION = "1.0.0" as const;
export const PUBLIC_TEMPLATE_MAX_DEPTH = 6;
export const PUBLIC_TEMPLATE_MAX_NODES = 40;

export const publicTemplateIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export const publicTemplateVersionSchema = z.number().int().min(1).max(999);

export const publicTemplatePartIds = [
  "trip-header",
  "active-view",
  "overview",
  "table",
  "timeline",
  "view-switcher",
  "desktop-map-toggle",
  "map-workspace",
  "mobile-map-trigger",
  "mobile-map-sheet",
  "viewer-share-dialog",
] as const;

export type PublicTemplatePartId = (typeof publicTemplatePartIds)[number];

export const publicTemplatePartIdSchema = z.enum(publicTemplatePartIds);

export const requiredPublicTemplateParts = [
  "trip-header",
  "view-switcher",
  "desktop-map-toggle",
  "map-workspace",
  "mobile-map-trigger",
  "mobile-map-sheet",
  "viewer-share-dialog",
] as const satisfies readonly PublicTemplatePartId[];

export const lockedPublicTemplateParts = [
  "active-view",
  "table",
  "map-workspace",
  "mobile-map-sheet",
] as const satisfies readonly PublicTemplatePartId[];

export const publicTemplateRegionIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);

export const requiredPublicTemplateRegions = [
  "header",
  "header-actions",
  "workspace",
  "content",
  "mobile-overlays",
] as const;

const publicTemplatePartNodeSchema = z
  .object({
    name: publicTemplatePartIdSchema,
    type: z.literal("part"),
  })
  .strict();

export type PublicTemplateRegionNodeV1 = {
  children: PublicTemplateLayoutNodeV1[];
  name: string;
  type: "region";
};

export type PublicTemplateLayoutNodeV1 =
  z.infer<typeof publicTemplatePartNodeSchema> | PublicTemplateRegionNodeV1;

const publicTemplateRegionNodeSchema: z.ZodType<PublicTemplateRegionNodeV1> = z.lazy(() =>
  z
    .object({
      children: z.array(publicTemplateLayoutNodeSchema),
      name: publicTemplateRegionIdSchema,
      type: z.literal("region"),
    })
    .strict(),
);

const publicTemplateLayoutNodeSchema: z.ZodType<PublicTemplateLayoutNodeV1> = z.lazy(() =>
  z.union([publicTemplatePartNodeSchema, publicTemplateRegionNodeSchema]),
);

const publicTemplateLayoutSchema = z
  .object({
    children: z.array(publicTemplateLayoutNodeSchema),
    id: z.string().min(1).max(80),
    type: z.literal("layout"),
  })
  .strict();

const publicTemplateStyleDeclarationSchema = z
  .object({ property: z.string().min(1), value: z.string().min(1) })
  .strict();

const publicTemplateStyleRuleSchema = z
  .object({
    declarations: z.array(publicTemplateStyleDeclarationSchema).min(1),
    media: z.string().optional(),
  })
  .strict();

export type PublicTemplateStyleRuleV1 = z.infer<typeof publicTemplateStyleRuleSchema>;

export const compiledPublicTemplateSchemaV1 = z
  .object({
    assetIds: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)),
    capabilities: z
      .object({
        parts: z.array(publicTemplatePartIdSchema),
        views: z.array(z.enum(["overview", "table", "timeline"])).length(3),
      })
      .strict(),
    compilerVersion: z.literal(PUBLIC_TEMPLATE_COMPILER_VERSION),
    digest: z.string().regex(/^sha256-[a-f0-9]{64}$/),
    id: publicTemplateIdSchema,
    key: z.string().regex(/^[a-z][a-z0-9-]{0,39}@[1-9][0-9]{0,2}$/),
    layout: publicTemplateLayoutSchema,
    layoutStyles: z.array(publicTemplateStyleRuleSchema),
    partHostStyles: z.record(publicTemplatePartIdSchema, z.array(publicTemplateStyleRuleSchema)),
    regionStyles: z.record(publicTemplateRegionIdSchema, z.array(publicTemplateStyleRuleSchema)),
    schemaVersion: z.literal(PUBLIC_TEMPLATE_SCHEMA_VERSION),
    scopedCss: z.string(),
    sourceMode: z.enum(["theme", "layout"]),
    version: publicTemplateVersionSchema,
  })
  .strict();

export type CompiledPublicTemplateV1 = z.infer<typeof compiledPublicTemplateSchemaV1>;

type PublicTemplateSourceBaseV1 = {
  assetIds?: string[];
  capabilities?: { parts?: PublicTemplatePartId[] };
  id: string;
  schemaVersion: 1;
  themeCss: string;
  version: number;
};

export type PublicTemplateSourceV1 = PublicTemplateSourceBaseV1 &
  ({ layoutHtml?: never; sourceMode: "theme" } | { layoutHtml: string; sourceMode: "layout" });

export function publicTemplateKey(id: string, version: number) {
  return `${id}@${version}`;
}
