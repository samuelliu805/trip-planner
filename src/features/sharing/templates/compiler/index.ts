import { createHash } from "node:crypto";

import { defaultPublicTemplateLayoutV1 } from "../default-layout.ts";
import { registeredPublicTemplateAssetIds } from "../runtime/assets.ts";
import {
  PUBLIC_TEMPLATE_COMPILER_VERSION,
  PUBLIC_TEMPLATE_SCHEMA_VERSION,
  compiledPublicTemplateSchemaV1,
  publicTemplateIdSchema,
  publicTemplateKey,
  publicTemplatePartIds,
  publicTemplateVersionSchema,
  type CompiledPublicTemplateV1,
  type PublicTemplateSourceV1,
} from "../schema.ts";
import { compilePublicTemplateCss } from "./css.ts";
import { PublicTemplateCompileError } from "./errors.ts";
import { parsePublicTemplateLayout } from "./layout.ts";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  return value;
}

export function stablePublicTemplateJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function compilePublicTemplate(source: PublicTemplateSourceV1): CompiledPublicTemplateV1 {
  if (
    source.schemaVersion !== PUBLIC_TEMPLATE_SCHEMA_VERSION ||
    !publicTemplateIdSchema.safeParse(source.id).success ||
    !publicTemplateVersionSchema.safeParse(source.version).success
  )
    throw new PublicTemplateCompileError("SOURCE_INVALID", "Template identity is invalid.");

  const key = publicTemplateKey(source.id, source.version);
  const layout = parsePublicTemplateLayout(
    source.sourceMode === "layout" ? source.layoutHtml : defaultPublicTemplateLayoutV1,
    source.sourceMode === "layout" ? `${key}-layout` : "default-layout-v1",
  );
  const assetIds = [...new Set(source.assetIds ?? [])].sort();
  for (const assetId of assetIds) {
    if (!registeredPublicTemplateAssetIds.includes(assetId as never))
      throw new PublicTemplateCompileError(
        "ASSET_NOT_REGISTERED",
        `Template asset is not registered: ${assetId}`,
      );
  }
  const capabilityParts = source.capabilities?.parts ?? [...publicTemplatePartIds];
  if (new Set(capabilityParts).size !== capabilityParts.length)
    throw new PublicTemplateCompileError("SOURCE_INVALID", "Template capabilities repeat a part.");

  const styles = compilePublicTemplateCss(source.themeCss, `[data-public-template-key="${key}"]`);
  const unsigned = {
    assetIds,
    capabilities: {
      parts: [...capabilityParts].sort(),
      views: ["overview", "table", "timeline"] as const,
    },
    compilerVersion: PUBLIC_TEMPLATE_COMPILER_VERSION,
    id: source.id,
    key,
    layout,
    ...styles,
    schemaVersion: PUBLIC_TEMPLATE_SCHEMA_VERSION,
    sourceMode: source.sourceMode,
    version: source.version,
  };
  const digest = `sha256-${createHash("sha256").update(stablePublicTemplateJson(unsigned)).digest("hex")}`;
  return compiledPublicTemplateSchemaV1.parse({ ...unsigned, digest });
}

export { PublicTemplateCompileError } from "./errors.ts";
